"use client";

import { useCallback, useEffect, useState } from "react";
import { Candy, History, House, LogOut, Plus, RefreshCw, Sparkles, UserRound } from "lucide-react";
import { Buddy, BuddyAvatar, BuddyPicker, BUDDIES, Lockup, Splash, useBuddy } from "./kids";
import * as api from "./api";
import { ApiError, type ApiRecord, type ApiRoom, type ApiUser, type LoginResponse } from "./api";
import { loadConfig } from "./config";
import { clearSession, loadSession, saveSession } from "./session";
import Login from "./login";
import Register from "./register";
import Management from "./management";
import SyncBar from "./syncbar";
import { clearMeCache, loadMeCache, outbox, saveMeCache } from "./offline";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Boot = { status: "loading" } | { status: "config-missing" } | { status: "offline"; message: string } | { status: "anon"; notice?: string } | { status: "ready"; idToken: string; user: ApiUser; rooms: ApiRoom[] };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });
  const [view, setView] = useState<"register" | "manage">("register");
  const [editTarget, setEditTarget] = useState<ApiRecord | null>(null);
  const [help, setHelp] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // Abertura animada: aparece uma vez a cada abertura do app (toque para pular).
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [buddy, chooseBuddy] = useBuddy(boot.status === "ready" ? boot.user.uid : undefined);

  const bootstrap = useCallback(async () => {
    setBoot({ status: "loading" });
    const { apiUrl } = await loadConfig();
    if (!apiUrl) {
      setBoot({ status: "config-missing" });
      return;
    }
    const stored = loadSession();
    const noNetwork = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!stored) {
      setBoot({ status: "anon" });
      return;
    }
    // Sessão vencida: com internet, pede login de novo. Sem internet, deixa a
    // recreadora continuar trabalhando offline com os dados já guardados; o
    // login é pedido quando a conexão voltar (antes de enviar a fila).
    const expired = stored.expiresAt <= Date.now();
    if (expired && !noNetwork) {
      clearSession();
      setBoot({ status: "anon", notice: outbox(stored.user.uid).length ? "Sua sessão expirou. Entre novamente para enviar os registros guardados neste aparelho." : undefined });
      return;
    }
    try {
      if (expired || noNetwork) throw new ApiError("OFFLINE", "Sem internet.");
      const data = await api.me(stored.idToken);
      saveMeCache(data);
      setView(data.user.role === "admin" ? "manage" : "register");
      setBoot({ status: "ready", idToken: stored.idToken, user: data.user, rooms: data.rooms });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "AUTH" || err.code === "FORBIDDEN")) {
        clearSession();
        setBoot({ status: "anon" });
        return;
      }
      const cached = loadMeCache(stored.user.uid);
      if (cached) {
        setView(cached.user.role === "admin" ? "manage" : "register");
        setBoot({ status: "ready", idToken: stored.idToken, user: cached.user, rooms: cached.rooms });
      } else {
        setBoot({ status: "offline", message: err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor." });
      }
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap, refreshTick]);

  async function onLoggedIn(res: LoginResponse) {
    const expiresAt = Date.now() + Number(res.expiresIn || "28800") * 1000;
    saveSession({ idToken: res.idToken, user: res.user, expiresAt });
    try {
      const data = res.me && res.me.user ? res.me : await api.me(res.idToken);
      saveMeCache(data);
      setView(data.user.role === "admin" ? "manage" : "register");
      setBoot({ status: "ready", idToken: res.idToken, user: data.user, rooms: data.rooms });
    } catch {
      // login funcionou mas a chamada seguinte falhou (rede instável): tenta de novo do zero.
      setRefreshTick((t) => t + 1);
    }
  }

  const onAuthExpired = useCallback((message?: string) => {
    clearSession();
    setEditTarget(null);
    setBoot({ status: "anon", notice: message });
  }, []);

  async function doLogout() {
    if (boot.status === "ready") {
      const n = outbox(boot.user.uid).filter((i) => i.status === "pending").length;
      if (n > 0 && !window.confirm(`Há ${n === 1 ? "1 registro ainda não enviado" : `${n} registros ainda não enviados`}. Eles continuam guardados neste aparelho e serão enviados quando você entrar de novo. Sair mesmo assim?`)) return;
      api.logout(boot.idToken).catch(() => {});
    }
    clearSession();
    clearMeCache();
    setEditTarget(null);
    setBoot({ status: "anon" });
  }

  const readyToken = boot.status === "ready" ? boot.idToken : "";
  const refreshRooms = useCallback(() => {
    if (!readyToken) return;
    api
      .me(readyToken)
      .then((data) => {
        saveMeCache(data);
        setBoot({ status: "ready", idToken: readyToken, user: data.user, rooms: data.rooms });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "AUTH") onAuthExpired("Sua sessão expirou. Entre novamente.");
      });
  }, [readyToken, onAuthExpired]);

  const splash = intro ? <Splash kind={buddy} onDone={endIntro} /> : null;

  if (boot.status === "loading") {
    return (
      <>
        {splash}
        <div className="boot-screen">
          <Buddy kind={buddy} pose="curious" className="boot-buddy" />
          <p>Abrindo a casinha…</p>
        </div>
      </>
    );
  }

  if (boot.status === "config-missing") {
    return (
      <div className="boot-screen">
        <Buddy kind={buddy} pose="curious" className="boot-buddy" />
        <p className="error-message" role="alert">
          Este site ainda não foi conectado ao backend. Um administrador precisa editar o arquivo <code>config.json</code>, publicado junto com este site, e preencher{" "}
          <code>apiUrl</code> com a URL /exec do Apps Script implantado.
        </p>
      </div>
    );
  }

  if (boot.status === "offline") {
    return (
      <div className="boot-screen">
        <Buddy kind={buddy} pose="sleep" className="boot-buddy" />
        <p className="error-message" role="alert">
          {boot.message}
        </p>
        <button className="action-button" onClick={() => setRefreshTick((t) => t + 1)}>
          <RefreshCw size={16} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (boot.status === "anon") {
    return (
      <>
        {splash}
        <Login onLoggedIn={onLoggedIn} initialNotice={boot.notice} buddy={buddy} />
      </>
    );
  }

  const { idToken, user, rooms } = boot;
  // Operador(a) só faz check-in e lança o estoque diário — sem dashboard,
  // histórico ou gestão de usuários/salas. Gestor(a) e admin continuam com o
  // menu completo ("Histórico e gestão", com abas por papel dentro dele).
  const isOperador = user.role === "operador";
  const secondNavLabel = isOperador ? "Estoque" : "Gestão";
  const SecondNavIcon = isOperador ? Candy : History;
  const roleLabel = { operador: "Recreadora", gestor: "Gestor(a) de sala", admin: "Administrador(a)" }[user.role];
  const goHome = () => {
    setEditTarget(null);
    setView("register");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="app-shell">
      {splash}
      <aside className="sidebar">
        <div className="brand-lockup">
          <Lockup />
        </div>
        <nav aria-label="Navegação principal">
          <a className={view === "register" ? "active" : ""} onClick={goHome}>
            <House size={20} />
            Início
          </a>
          <a className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>
            <SecondNavIcon size={20} />
            {isOperador ? "Estoque" : "Histórico e gestão"}
          </a>
          <a onClick={() => setProfileOpen(true)}>
            <UserRound size={20} />
            Meu parceiro
          </a>
          <a onClick={() => setHelp(true)}>
            <Sparkles size={20} />
            Ajuda rápida
          </a>
        </nav>
        <div className="sidebar-buddy" aria-hidden="true">
          <Buddy kind={buddy} pose="idle" />
        </div>
        <div className="sidebar-profile">
          <button className="avatar-button" onClick={() => setProfileOpen(true)} aria-label="Meu perfil">
            <BuddyAvatar kind={buddy} size={40} />
          </button>
          <div>
            <strong>{user.name}</strong>
            <span>{roleLabel}</span>
          </div>
          <button aria-label="Sair" onClick={doLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace" id="registro">
        <header className="topbar">
          <div className="mobile-brand">
            <Lockup />
          </div>
          <div className="room-label">
            <span>Perfil</span>
            <strong>{roleLabel}</strong>
          </div>
          <button className="profile-button" onClick={() => setProfileOpen(true)} aria-label="Meu perfil">
            <BuddyAvatar kind={buddy} size={40} />
            <span className="profile-copy">
              {user.name.split(" ")[0]}
              <br />
              <small>Meu perfil</small>
            </span>
          </button>
        </header>

        <SyncBar idToken={idToken} uid={user.uid} rooms={rooms} onAuthExpired={onAuthExpired} onReconnect={refreshRooms} />

        {view === "register" ? (
          <Register
            user={user}
            idToken={idToken}
            rooms={rooms}
            editTarget={editTarget}
            buddy={buddy}
            onSaved={() => setEditTarget(null)}
            onCancelEdit={() => setEditTarget(null)}
            onAuthExpired={() => onAuthExpired("Sua sessão expirou. Entre novamente.")}
          />
        ) : (
          <Management
            user={user}
            idToken={idToken}
            rooms={rooms}
            buddy={buddy}
            onRoomsChanged={refreshRooms}
            onEdit={(record) => {
              setEditTarget(record);
              setView("register");
            }}
            onAuthExpired={onAuthExpired}
          />
        )}

        <nav className="mobile-nav" aria-label="Abas do app">
          <a className={view === "register" ? "active" : ""} onClick={goHome}>
            <House size={22} />
            <span>Início</span>
          </a>
          <a className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>
            <SecondNavIcon size={22} />
            <span>{secondNavLabel}</span>
          </a>
          <a className="nav-plus" onClick={goHome} aria-label="Novo check-in">
            <span>
              <Plus size={26} strokeWidth={2.8} />
            </span>
          </a>
          <a onClick={() => setHelp(true)}>
            <Sparkles size={22} />
            <span>Ajuda</span>
          </a>
          <a onClick={() => setProfileOpen(true)}>
            <UserRound size={22} />
            <span>Perfil</span>
          </a>
        </nav>
      </section>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="profile-dialog">
          <div className="profile-top">
            <BuddyAvatar kind={buddy} size={88} />
            <DialogTitle>{user.name}</DialogTitle>
            <DialogDescription>
              {roleLabel}
              {user.role !== "admin" && rooms.length ? ` · ${rooms.filter((r) => user.roomIds.includes(r.id)).map((r) => r.name).join(", ")}` : ""}
            </DialogDescription>
          </div>
          <p className="lbl">Meu parceiro de turno</p>
          <BuddyPicker kind={buddy} onChoose={chooseBuddy} />
          <p className="data-note" style={{ margin: 0 }}>
            {BUDDIES[buddy].name} aparece na abertura, no início e comemora cada check-in com você. A escolha fica guardada neste aparelho.
          </p>
          <button className="secondary logout-button" type="button" onClick={doLogout}>
            <LogOut size={18} />
            Sair da conta
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Registro rápido</DialogTitle>
          <DialogDescription>Como usar o Kids-In</DialogDescription>
          <p>Registre cada criança assim que ela chegar: nome, faixa etária, gênero e as informações de cuidado (TEA, deficiência, lanche, banheiro, restrição alimentar) antes de confirmar.</p>
          <p>
            {user.role === "admin"
              ? "Como administrador, você pode registrar e corrigir qualquer data passada, além de gerenciar usuários e salas."
              : user.role === "gestor"
              ? "Você pode corrigir registros das suas salas pelo menu Histórico e gestão durante os últimos 7 dias, além de cadastrar recreadoras e ajustar o estoque."
              : "Registre a saída de estoque de hoje pelo menu Estoque. Se precisar corrigir um check-in já enviado, peça a um(a) gestor(a) ou administrador(a) — o prazo é de até 7 dias."}
          </p>
          <p>Não colete documento ou CPF da criança. As informações são pessoais e algumas são sensíveis (deficiência, restrição alimentar): use apenas para o cuidado durante o atendimento.</p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
