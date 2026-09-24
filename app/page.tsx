"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Candy, ClipboardList, History, Loader2, LogOut, RefreshCw, Sparkles } from "lucide-react";
import * as api from "./api";
import { ApiError, type ApiRecord, type ApiRoom, type ApiUser, type LoginResponse } from "./api";
import { loadConfig } from "./config";
import { clearSession, loadSession, saveSession } from "./session";
import Login from "./login";
import Register from "./register";
import Management from "./management";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Boot = { status: "loading" } | { status: "config-missing" } | { status: "offline"; message: string } | { status: "anon"; notice?: string } | { status: "ready"; idToken: string; user: ApiUser; rooms: ApiRoom[] };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export default function App() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });
  const [view, setView] = useState<"register" | "manage">("register");
  const [editTarget, setEditTarget] = useState<ApiRecord | null>(null);
  const [help, setHelp] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const bootstrap = useCallback(async () => {
    setBoot({ status: "loading" });
    const { apiUrl } = await loadConfig();
    if (!apiUrl) {
      setBoot({ status: "config-missing" });
      return;
    }
    const stored = loadSession();
    if (!stored || stored.expiresAt <= Date.now()) {
      if (stored) clearSession();
      setBoot({ status: "anon" });
      return;
    }
    try {
      const data = await api.me(stored.idToken);
      setView(data.user.role === "admin" ? "manage" : "register");
      setBoot({ status: "ready", idToken: stored.idToken, user: data.user, rooms: data.rooms });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "AUTH" || err.code === "FORBIDDEN")) {
        clearSession();
        setBoot({ status: "anon" });
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
      const data = await api.me(res.idToken);
      setView(data.user.role === "admin" ? "manage" : "register");
      setBoot({ status: "ready", idToken: res.idToken, user: data.user, rooms: data.rooms });
    } catch {
      // login funcionou mas a chamada seguinte falhou (rede instável): tenta de novo do zero.
      setRefreshTick((t) => t + 1);
    }
  }

  function onAuthExpired(message?: string) {
    clearSession();
    setEditTarget(null);
    setBoot({ status: "anon", notice: message });
  }

  async function doLogout() {
    if (boot.status === "ready") {
      api.logout(boot.idToken).catch(() => {});
    }
    clearSession();
    setEditTarget(null);
    setBoot({ status: "anon" });
  }

  function refreshRooms() {
    if (boot.status !== "ready") return;
    api
      .me(boot.idToken)
      .then((data) => setBoot({ status: "ready", idToken: boot.idToken, user: data.user, rooms: data.rooms }))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "AUTH") onAuthExpired("Sua sessão expirou. Entre novamente.");
      });
  }

  if (boot.status === "loading") {
    return (
      <div className="boot-screen">
        <Loader2 size={28} className="spin" />
        <p>Carregando GAV Kids…</p>
      </div>
    );
  }

  if (boot.status === "config-missing") {
    return (
      <div className="boot-screen">
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
    return <Login onLoggedIn={onLoggedIn} initialNotice={boot.notice} />;
  }

  const { idToken, user, rooms } = boot;
  // Operador(a) só faz check-in e lança o estoque diário — sem dashboard,
  // histórico ou gestão de usuários/salas. Gestor(a) e admin continuam com o
  // menu completo ("Histórico e gestão", com abas por papel dentro dele).
  const isOperador = user.role === "operador";
  const secondNavLabel = isOperador ? "Estoque" : "Histórico e gestão";
  const SecondNavIcon = isOperador ? Candy : History;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="./gav-logo-cream.png" alt="GAV Hotéis e Resorts" />
          <span>Kids</span>
        </div>
        <nav aria-label="Navegação principal">
          <a className={view === "register" ? "active" : ""} onClick={() => { setEditTarget(null); setView("register"); }}>
            <ClipboardList size={20} />
            Início
          </a>
          <a className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>
            <SecondNavIcon size={20} />
            {secondNavLabel}
          </a>
          <a onClick={() => setHelp(true)}>
            <Sparkles size={20} />
            Ajuda rápida
          </a>
        </nav>
        <div className="sidebar-profile">
          <div className="avatar">{initials(user.name)}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{{ operador: "Operador(a)", gestor: "Gestor(a) de sala", admin: "Administrador(a)" }[user.role]}</span>
          </div>
          <button aria-label="Sair" onClick={doLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace" id="registro">
        <header className="topbar">
          <div className="mobile-brand">
            <img src="./gav-logo-blue.png" alt="GAV" />
            <span>Kids</span>
          </div>
          <div className="room-label">
            <span>Perfil</span>
            <strong>{{ operador: "Operador(a)", gestor: "Gestor(a) de sala", admin: "Administrador(a)" }[user.role]}</strong>
          </div>
          <button className="profile-button" onClick={doLogout}>
            <span>{initials(user.name)}</span>
            <span className="profile-copy">
              {user.name.split(" ")[0]}
              <br />
              <small>Sair</small>
            </span>
          </button>
        </header>

        {view === "register" ? (
          <Register
            user={user}
            idToken={idToken}
            rooms={rooms}
            editTarget={editTarget}
            onSaved={() => setEditTarget(null)}
            onCancelEdit={() => setEditTarget(null)}
            onAuthExpired={() => onAuthExpired("Sua sessão expirou. Entre novamente.")}
          />
        ) : (
          <Management
            user={user}
            idToken={idToken}
            rooms={rooms}
            onRoomsChanged={refreshRooms}
            onEdit={(record) => {
              setEditTarget(record);
              setView("register");
            }}
            onAuthExpired={onAuthExpired}
          />
        )}

        <nav className="mobile-nav">
          <a className={view === "register" ? "active" : ""} onClick={() => { setEditTarget(null); setView("register"); }}>
            <ClipboardList size={20} />
            <span>Início</span>
          </a>
          <a className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>
            <SecondNavIcon size={20} />
            <span>{secondNavLabel}</span>
          </a>
          {!isOperador && (
            <a onClick={() => setView("manage")}>
              <BarChart3 size={20} />
              <span>Resumo</span>
            </a>
          )}
        </nav>
      </section>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Registro rápido</DialogTitle>
          <DialogDescription>Como usar o GAV Kids</DialogDescription>
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
