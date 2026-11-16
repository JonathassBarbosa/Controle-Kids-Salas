"use client";
// Avaliação e melhorias (Kids-In v5.5): formulário ANÔNIMO para as
// recreadoras e, para o administrador, abrir/encerrar a coleta e ver as
// respostas. O servidor não grava quem respondeu; aqui também não enviamos
// nada do usuário além da sessão exigida pela API.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Lock, MessageCircleHeart, RefreshCw } from "lucide-react";
import * as api from "./api";
import { ApiError, FEEDBACK_AREAS, type ApiRoom, type ApiUser, type FeedbackResponse, type FeedbackStatus } from "./api";
import { formatDateBR, roomName, shifts, suggestedShift } from "./model";
import { Choice } from "./choice";
import { Buddy, Confetti, type BuddyKind, type Pose } from "./kids";

const RATINGS: { value: number; label: string; pose: Pose }[] = [
  { value: 1, label: "Muito difícil", pose: "sleep" },
  { value: 2, label: "Difícil", pose: "curious" },
  { value: 3, label: "Mais ou menos", pose: "idle" },
  { value: 4, label: "Fácil", pose: "idle" },
  { value: 5, label: "Muito fácil", pose: "wave" },
];
const doneKey = (cycle: string) => `kidsin-avaliacao:${cycle}`;

export function feedbackDone(cycle: string) {
  try {
    return !!cycle && localStorage.getItem(doneKey(cycle)) === "1";
  } catch {
    return false;
  }
}

/** Situação da coleta. `supported` fica false se o Apps Script ainda não tem a v5.5. */
export function useFeedbackStatus(idToken: string) {
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [supported, setSupported] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!idToken) return;
    let cancelled = false;
    api
      .feedbackStatus(idToken)
      .then((s) => {
        if (!cancelled) {
          setStatus(s);
          setSupported(true);
        }
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.code === "NOT_FOUND") setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idToken, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { status, supported, reload, setStatus };
}

export function FeedbackBanner({ status, buddy, onOpen }: { status: FeedbackStatus; buddy: BuddyKind; onOpen: () => void }) {
  return (
    <button type="button" className="fb-banner" onClick={onOpen}>
      <span className="fb-banner-buddy">
        <Buddy kind={buddy} pose="wave" />
      </span>
      <span className="fb-banner-txt">
        <b>Conta pra gente: como está o Kids-In?</b>
        <small>Avaliação {status.cycle} · anônima · leva uns 3 minutos</small>
      </span>
      <span className="fb-banner-go">
        Responder <ChevronRight size={16} />
      </span>
    </button>
  );
}

type Draft = Omit<api.FeedbackInput, "requestId">;

export function FeedbackForm({
  idToken,
  rooms,
  buddy,
  status,
  onDone,
  onAuthExpired,
}: {
  idToken: string;
  rooms: ApiRoom[];
  buddy: BuddyKind;
  status: FeedbackStatus;
  onDone: () => void;
  onAuthExpired: () => void;
}) {
  const roomOptions = useMemo(() => rooms.filter((r) => r.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [rooms]);
  const [draft, setDraft] = useState<Draft>(() => ({
    roomId: roomOptions.length === 1 ? roomOptions[0].id : "",
    shift: suggestedShift(),
    rating: 0,
    goodAreas: [],
    badAreas: [],
    working: "",
    improve: "",
    notWorking: "",
    missing: "",
  }));
  const [requestId] = useState(() => api.newRequestId());
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(0);

  const patch = (f: Partial<Draft>) => setDraft((d) => ({ ...d, ...f }));
  const toggleArea = (key: "goodAreas" | "badAreas", area: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(area) ? d[key].filter((a) => a !== area) : [...d[key], area] }));

  function next() {
    if (step === 1) {
      if (!draft.roomId) return setError("Escolha a sala de vendas.");
      if (!draft.shift) return setError("Escolha o turno.");
      if (!draft.rating) return setError("Escolha uma nota de 1 a 5.");
    }
    setError("");
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("A avaliação precisa de internet. Suas respostas continuam aqui: tente de novo quando a conexão voltar.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.feedbackSubmit(idToken, {
        requestId,
        ...draft,
        working: draft.working.trim(),
        improve: draft.improve.trim(),
        notWorking: draft.notWorking.trim(),
        missing: draft.missing.trim(),
      });
      try {
        localStorage.setItem(doneKey(status.cycle), "1");
      } catch {
        // sem armazenamento: o convite pode aparecer de novo, sem problema
      }
      setSent((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH") return onAuthExpired();
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const area = (key: "goodAreas" | "badAreas") => (
    <div className="fb-chips" role="group">
      {FEEDBACK_AREAS.map((a) => (
        <button key={a} type="button" aria-pressed={draft[key].includes(a)} className={draft[key].includes(a) ? (key === "goodAreas" ? "on good" : "on bad") : ""} onClick={() => toggleArea(key, a)}>
          {draft[key].includes(a) && <Check size={14} />}
          {a}
        </button>
      ))}
    </div>
  );
  const longText = (key: "working" | "improve" | "notWorking" | "missing", label: string, hint: string) => (
    <label className="notes fb-text">
      {label} <span>opcional</span>
      <textarea maxLength={1000} value={draft[key]} onChange={(e) => patch({ [key]: e.target.value } as Partial<Draft>)} placeholder={hint} />
      <small>{draft[key].length}/1000</small>
    </label>
  );

  return (
    <div className="content">
      <div className="welcome-row">
        <div className="hello-card">
          <div className="hello-copy">
            <p className="eyebrow">AVALIAÇÃO {status.cycle.toUpperCase()}</p>
            <h1>Como está o Kids-In?</h1>
            <p>Conte o que funciona, o que pode melhorar e o que está faltando. Suas respostas guiam as próximas versões.</p>
          </div>
          <div className="hello-buddy">
            <span className="bubble">{sent ? "Obrigada!" : step === 1 ? "Bora avaliar?" : step === 2 ? "Pode ser sincera!" : "Quase lá!"}</span>
            <Buddy kind={buddy} pose={sent ? "wave" : "curious"} jump={sent} />
          </div>
        </div>
        <div className="today-card fb-anon">
          <Lock size={20} />
          <div>
            <span>Resposta anônima</span>
            <strong>Não guardamos seu nome nem usuário</strong>
          </div>
        </div>
      </div>

      {!sent && (
        <div className="progress-wrap" aria-label={`Etapa ${step} de 3`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= step ? "filled" : ""} />
          ))}
          <small>Etapa {step} de 3</small>
        </div>
      )}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      <section className="form-card">
        {sent ? (
          <div className="success-state">
            <div className="success-buddy">
              <Confetti fire={sent} />
              <Buddy kind={buddy} pose="wave" jump={sent} />
              <span className="success-icon">
                <Check size={22} />
              </span>
            </div>
            <p className="eyebrow">AVALIAÇÃO ENVIADA</p>
            <h2>Obrigada pela sua avaliação!</h2>
            <p>Sua resposta é anônima e vai ajudar a planejar as próximas versões do Kids-In.</p>
            <button className="primary" type="button" onClick={onDone}>
              Voltar ao início
            </button>
          </div>
        ) : step === 1 ? (
          <div className="step-content">
            <div className="step-buddy">
              <Buddy kind={buddy} pose="curious" />
              <span className="bubble">Onde você trabalha?</span>
            </div>
            <p className="eyebrow">SALA E TURNO</p>
            <h2>Onde e quando você usa o app</h2>
            <p>Sem nome nem usuário: só a sala e o turno, para entender cada lugar.</p>
            <div className="entry-grid">
              <Choice
                label="Sala de vendas"
                value={draft.roomId}
                onChange={(v) => patch({ roomId: v })}
                options={roomOptions.map((r) => r.id)}
                optionLabels={Object.fromEntries(roomOptions.map((r) => [r.id, r.name]))}
              />
              <Choice label="Turno" value={draft.shift} onChange={(v) => patch({ shift: v })} options={shifts} />
            </div>
            <p className="fb-q">No dia a dia, usar o Kids-In é…</p>
            <div className="fb-rating" role="radiogroup" aria-label="Nota de 1 a 5">
              {RATINGS.map((r) => (
                <button key={r.value} type="button" role="radio" aria-checked={draft.rating === r.value} className={draft.rating === r.value ? "on" : ""} onClick={() => patch({ rating: r.value })}>
                  <span className="fb-face">
                    <img src={`./kids/${buddy}-${r.pose}.webp`} alt="" />
                  </span>
                  <b>{r.value}</b>
                  <small>{r.label}</small>
                </button>
              ))}
            </div>
          </div>
        ) : step === 2 ? (
          <div className="step-content">
            <p className="eyebrow">O QUE FUNCIONA E O QUE NÃO</p>
            <h2>Conte como está cada parte</h2>
            <p>Toque nas partes do app. Pode marcar quantas quiser.</p>
            <p className="fb-q good">Está funcionando bem</p>
            {area("goodAreas")}
            {longText("working", "O que está funcionando bem?", "Ex.: o check-in ficou rápido no celular.")}
            <p className="fb-q bad">Precisa de atenção</p>
            {area("badAreas")}
            {longText("notWorking", "O que não está funcionando?", "Conte o que aconteceu e em qual tela, se lembrar.")}
          </div>
        ) : (
          <div className="step-content">
            <p className="eyebrow">MELHORIAS</p>
            <h2>O que pode melhorar e o que falta</h2>
            <p>Suas ideias entram na lista das próximas versões.</p>
            {longText("improve", "O que pode melhorar?", "Ex.: deixar o botão de saída mais fácil de achar.")}
            {longText("missing", "O que está faltando no app?", "Uma função, uma informação, um relatório…")}
            <div className="fb-summary">
              <span>
                <b>{roomName(rooms, draft.roomId)}</b> · {draft.shift}
              </span>
              <span>
                Nota <b>{draft.rating}</b> de 5
              </span>
              <span>
                <Lock size={13} /> Anônima
              </span>
            </div>
          </div>
        )}

        {!sent && (
          <footer className="form-actions">
            <button className="secondary" type="button" disabled={saving} onClick={() => (step === 1 ? onDone() : setStep((s) => s - 1))}>
              <ChevronLeft size={19} />
              {step === 1 ? "Agora não" : "Voltar"}
            </button>
            {step < 3 ? (
              <button className="primary" type="button" onClick={next}>
                Continuar
                <ChevronRight size={19} />
              </button>
            ) : (
              <button className="primary confirm" type="button" disabled={saving} onClick={submit}>
                {saving ? <Loader2 size={19} className="spin" /> : <Check size={19} />}
                Enviar avaliação
              </button>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}

function defaultCycle() {
  const m = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/** Abre/encerra a coleta (administrador). */
export function FeedbackControl({
  idToken,
  status,
  supported,
  onChange,
  onAuthExpired,
}: {
  idToken: string;
  status: FeedbackStatus | null;
  supported: boolean;
  onChange: (s: FeedbackStatus) => void;
  onAuthExpired: () => void;
}) {
  const [cycle, setCycle] = useState(defaultCycle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!supported) {
    return <p className="offline-note">Para usar a avaliação, atualize o Apps Script para a versão 5.5 (Code-v5.5.gs) e implante uma nova versão.</p>;
  }
  if (!status) {
    return (
      <p className="data-note">
        <Loader2 size={16} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} />
        Carregando a situação da avaliação…
      </p>
    );
  }
  async function set(open: boolean) {
    setBusy(true);
    setError("");
    try {
      onChange(await api.feedbackSet(idToken, open, open ? cycle.trim() : undefined));
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH") return onAuthExpired();
      setError(err instanceof ApiError ? err.message : "Não foi possível mudar a coleta agora.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={status.open ? "fb-control open" : "fb-control"}>
      <div className="fb-control-head">
        <span className="fb-dot" aria-hidden="true" />
        <div>
          <b>{status.open ? "Coleta aberta" : "Coleta encerrada"}</b>
          <small>
            {status.open
              ? `${status.cycle} · desde ${status.openedAt ? formatDateBR(status.openedAt.slice(0, 10)) : "agora"}`
              : status.cycle
              ? `Última: ${status.cycle}${status.closedAt ? ` · encerrada em ${formatDateBR(status.closedAt.slice(0, 10))}` : ""}`
              : "Nenhuma coleta aberta ainda"}
          </small>
        </div>
        <button type="button" role="switch" aria-checked={status.open} aria-label={status.open ? "Encerrar coleta" : "Abrir coleta"} className="fb-switch" disabled={busy || (!status.open && cycle.trim().length < 3)} onClick={() => set(!status.open)}>
          <i />
        </button>
      </div>
      {!status.open && (
        <label className="field">
          Nome do período de coleta
          <input value={cycle} maxLength={80} onChange={(e) => setCycle(e.target.value)} placeholder="Ex.: Novembro 2026" />
        </label>
      )}
      <p className="fb-control-note">
        {status.open
          ? "As recreadoras veem o convite no início do app até você encerrar."
          : "Ao abrir, as recreadoras passam a ver o convite para responder no início do app."}
      </p>
      {busy && <Loader2 size={16} className="spin" />}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function csvCell(v: string | number) {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Resultados para o administrador (aba "Avaliações" da gestão). */
export function FeedbackResults({ idToken, rooms, onAuthExpired }: { idToken: string; rooms: ApiRoom[]; user: ApiUser; onAuthExpired: () => void }) {
  const { status, supported, setStatus } = useFeedbackStatus(idToken);
  const [cycle, setCycle] = useState("");
  const [data, setData] = useState<{ cycles: string[]; responses: FeedbackResponse[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("Todos");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .feedbackList(idToken, cycle || undefined)
      .then((r) => {
        if (cancelled) return;
        setData({ cycles: r.cycles, responses: r.responses });
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "AUTH") return onAuthExpired();
        if (err instanceof ApiError && err.code === "NOT_FOUND") setData({ cycles: [], responses: [] });
        else setError(err instanceof ApiError ? err.message : "Não foi possível carregar as avaliações.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // onAuthExpired chega como função nova a cada render; só recarrega quando os filtros mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken, cycle, tick]);

  const list = useMemo(
    () => (data?.responses || []).filter((r) => (!roomFilter || r.roomId === roomFilter) && (shiftFilter === "Todos" || r.shift === shiftFilter)),
    [data, roomFilter, shiftFilter]
  );
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  const dist = [1, 2, 3, 4, 5].map((n) => list.filter((r) => r.rating === n).length);
  const distMax = Math.max(1, ...dist);
  const areaRows = FEEDBACK_AREAS.map((a) => ({ a, good: list.filter((r) => r.goodAreas.includes(a)).length, bad: list.filter((r) => r.badAreas.includes(a)).length }));
  const areaMax = Math.max(1, ...areaRows.map((r) => Math.max(r.good, r.bad)));
  const worst = [...areaRows].sort((x, y) => y.bad - x.bad)[0];
  const roomsAnswered = new Set(list.map((r) => r.roomId)).size;
  const answeredRooms = rooms.filter((r) => (data?.responses || []).some((x) => x.roomId === r.id));

  function exportCsv() {
    const head = ["Período", "Data", "Sala", "Turno", "Nota", "Funciona bem (áreas)", "Precisa de atenção (áreas)", "O que funciona", "O que pode melhorar", "O que não funciona", "O que falta"];
    const rows = list.map((r) => [r.cycle, formatDateBR(r.date), roomName(rooms, r.roomId), r.shift, r.rating, r.goodAreas.join("; "), r.badAreas.join("; "), r.working, r.improve, r.notWorking, r.missing]);
    const csv = "﻿" + [head, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kids-in-avaliacoes${cycle ? "-" + cycle.replace(/\s+/g, "-") : ""}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const groups: { key: "working" | "improve" | "notWorking" | "missing"; title: string; cls: string }[] = [
    { key: "working", title: "O que está funcionando", cls: "g-good" },
    { key: "improve", title: "O que pode melhorar", cls: "g-improve" },
    { key: "notWorking", title: "O que não está funcionando", cls: "g-bad" },
    { key: "missing", title: "O que está faltando", cls: "g-missing" },
  ];

  return (
    <div className="fb-results">
      <div className="fb-results-top">
        <div>
          <h2>Avaliação das recreadoras</h2>
          <p className="data-note" style={{ margin: "6px 0 0" }}>
            Respostas anônimas: só sala, turno e data. Use para decidir o que entra nas próximas versões.
          </p>
        </div>
        <FeedbackControl idToken={idToken} status={status} supported={supported} onChange={setStatus} onAuthExpired={onAuthExpired} />
      </div>

      <div className="dash-controls">
        <div className="room-chips" role="group" aria-label="Período de coleta">
          {["", ...(data?.cycles || [])].map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={cycle === c}
              onClick={() => {
                setLoading(true);
                setCycle(c);
              }}
            >
              {c || "Todos os períodos"}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Turno">
          {["Todos", ...shifts].map((s) => (
            <button key={s} type="button" aria-pressed={shiftFilter === s} onClick={() => setShiftFilter(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {answeredRooms.length > 1 && (
        <div style={{ maxWidth: 340, marginBottom: 14 }}>
          <Choice label="Sala de vendas" value={roomFilter || "todas"} onChange={(v) => setRoomFilter(v === "todas" ? "" : v)} options={["todas", ...answeredRooms.map((r) => r.id)]} optionLabels={{ todas: "Todas as salas", ...Object.fromEntries(answeredRooms.map((r) => [r.id, r.name])) }} />
        </div>
      )}

      {loading ? (
        <p className="data-note">
          <Loader2 size={16} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} />
          Carregando avaliações…
        </p>
      ) : error ? (
        <p className="error-message" role="alert">
          {error}{" "}
          <button className="link-button" onClick={() => setTick((t) => t + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : list.length === 0 ? (
        <div className="empty-message fb-empty">
          <MessageCircleHeart size={28} />
          <p>Nenhuma resposta {cycle ? `em ${cycle}` : "ainda"}{roomFilter || shiftFilter !== "Todos" ? " com esses filtros" : ""}.</p>
          {!status?.open && supported && <p className="data-note">Abra uma coleta acima para as recreadoras receberem o convite.</p>}
        </div>
      ) : (
        <>
          <div className="metrics">
            <article>
              <span>Respostas</span>
              <strong>{list.length}</strong>
            </article>
            <article>
              <span>Nota média (1 a 5)</span>
              <strong>{avg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong>
            </article>
            <article>
              <span>Salas que responderam</span>
              <strong>{roomsAnswered}</strong>
            </article>
            <article>
              <span>Mais citado para melhorar</span>
              <strong className="fb-small-num">{worst && worst.bad ? worst.a : "—"}</strong>
            </article>
          </div>

          <div className="room-detail">
            <article className="panel">
              <div className="panel-head">
                <h2>Funciona bem × precisa de atenção</h2>
                <span>Partes do app marcadas</span>
              </div>
              <div className="legend">
                <span>
                  <i style={{ background: "var(--good)" }} />
                  Funciona bem
                </span>
                <span>
                  <i style={{ background: "var(--y-deep)" }} />
                  Precisa de atenção
                </span>
              </div>
              <div className="fb-areas">
                {areaRows.map((r) => (
                  <div key={r.a}>
                    <span>{r.a}</span>
                    <span className="fb-bars" title={`${r.a}: ${r.good} funciona bem · ${r.bad} precisa de atenção`}>
                      <i className="g" style={{ width: `${(100 * r.good) / areaMax}%` }} />
                      <i className="b" style={{ width: `${(100 * r.bad) / areaMax}%` }} />
                    </span>
                    <b>
                      {r.good} · {r.bad}
                    </b>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="panel-head">
                <h2>Facilidade de uso</h2>
                <span>Nota de 1 a 5</span>
              </div>
              {RATINGS.slice()
                .reverse()
                .map((r) => (
                  <div className="hb" key={r.value}>
                    <span>
                      {r.value} · {r.label}
                    </span>
                    <div className="tr">
                      <i style={{ width: `${(100 * dist[r.value - 1]) / distMax}%` }} />
                    </div>
                    <b>{dist[r.value - 1]}</b>
                  </div>
                ))}
            </article>
          </div>

          <div className="export-actions">
            <h2>Respostas escritas</h2>
            <button type="button" onClick={() => setTick((t) => t + 1)}>
              <RefreshCw size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Atualizar
            </button>
            <button type="button" onClick={exportCsv}>
              <Download size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Baixar planilha (CSV)
            </button>
          </div>
          <div className="fb-groups">
            {groups.map((g) => {
              const items = list.filter((r) => r[g.key].trim());
              return (
                <section key={g.key} className={`fb-group ${g.cls}`}>
                  <h3>
                    {g.title} <span>{items.length}</span>
                  </h3>
                  {items.length === 0 ? (
                    <p className="data-note">Nenhuma resposta escrita.</p>
                  ) : (
                    <ul>
                      {items.map((r) => (
                        <li key={r.id}>
                          <p>{r[g.key]}</p>
                          <small>
                            {roomName(rooms, r.roomId)} · {r.shift} · {formatDateBR(r.date)}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
