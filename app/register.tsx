"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Accessibility,
  Baby,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Pencil,
  PhoneCall,
  RefreshCw,
  Salad,
  ShieldCheck,
  Sparkles,
  Undo2,
  Utensils,
} from "lucide-react";
import * as api from "./api";
import { ApiError, type ApiRecord, type ApiRoom, type ApiUser, type Bathroom } from "./api";
import { ages, bathroomOptions, careSummary, daysAgo, draftSignature, emptyDraft, formatDateBR, genders, minutesSince, roomName, shifts, suggestedShift, today, validateEntryDraft, type EntryDraft } from "./model";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Choice } from "./choice";

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <Choice label={label} value={value ? "sim" : "nao"} onChange={(v) => onChange(v === "sim")} options={["sim", "nao"]} optionLabels={{ sim: "Sim", nao: "Não" }} />;
}

function NoteField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      {label} <span className="optional-tag">opcional</span>
      <input type="text" maxLength={300} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function draftFromRecord(r: ApiRecord): EntryDraft {
  return {
    id: r.id,
    version: r.version,
    roomId: r.roomId,
    date: r.date,
    shift: r.shift,
    childName: r.childName,
    age: r.age,
    gender: r.gender,
    tea: r.tea,
    disability: r.disability,
    disabilityNote: r.disabilityNote,
    snackOk: r.snackOk,
    snackNote: r.snackNote,
    bathroom: r.bathroom,
    bathroomNote: r.bathroomNote,
    foodRestriction: r.foodRestriction,
    foodRestrictionNote: r.foodRestrictionNote,
    notes: r.notes,
  };
}

export default function Register({
  user,
  idToken,
  rooms,
  editTarget,
  onSaved,
  onCancelEdit,
  onAuthExpired,
}: {
  user: ApiUser;
  idToken: string;
  rooms: ApiRoom[];
  editTarget: ApiRecord | null;
  onSaved: (rec: ApiRecord) => void;
  onCancelEdit: () => void;
  onAuthExpired: () => void;
}) {
  const allowedRooms = useMemo(
    () => rooms.filter((r) => r.active && (user.role === "admin" || user.roomIds.includes(r.id))),
    [rooms, user]
  );
  const allowPastLimit = user.role === "admin" ? null : 7;

  const [draft, setDraft] = useState<EntryDraft>(() => (editTarget ? draftFromRecord(editTarget) : emptyDraft(allowedRooms[0]?.id || "")));
  const [dateOpen, setDateOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState<ApiRecord | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ id: string; signature: string } | null>(null);

  // Atalho de autocorreção: quem criou o registro pode corrigi-lo direto pela
  // lista da própria sala, sem precisar de "Histórico e gestão" (que a
  // recreadora pura nem tem acesso). É só uma facilidade de interface — a
  // regra de quem pode corrigir o quê continua 100% a cargo do servidor
  // (records.save já aceita isso normalmente); aqui só decidimos quando
  // MOSTRAR o atalho (até 2h da criação).
  const [selfEdit, setSelfEdit] = useState<ApiRecord | null>(null);
  const effectiveEditTarget = editTarget || selfEdit;

  // Lista de quem já foi registrado nesta sala/data/turno — visível a todas as
  // recreadoras da sala (não só a quem registrou). Clique num item abre os
  // detalhes completos; correções "de verdade" fora do atalho de 2h
  // continuam pelo Histórico e gestão (gestor/admin).
  const [roster, setRoster] = useState<ApiRecord[] | null>(null);
  const [rosterError, setRosterError] = useState(false);
  const [rosterTick, setRosterTick] = useState(0);
  const [detail, setDetail] = useState<ApiRecord | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function patch(fields: Partial<EntryDraft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  useEffect(() => {
    if (editTarget) {
      setSelfEdit(null);
      setDraft(draftFromRecord(editTarget));
      setStep(1);
      setSaved(null);
      setError("");
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget?.id, editTarget?.version]);

  useEffect(() => {
    if (selfEdit) {
      setDraft(draftFromRecord(selfEdit));
      setStep(1);
      setSaved(null);
      setError("");
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfEdit?.id, selfEdit?.version]);

  useEffect(() => {
    if (!draft.roomId || !draft.date || !draft.shift) {
      setRoster([]);
      return;
    }
    let cancelled = false;
    setRosterError(false);
    api
      .listAllRecords(idToken, { from: draft.date, to: draft.date, roomId: draft.roomId, shift: draft.shift })
      .then((res) => {
        if (!cancelled) setRoster(res.records);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "AUTH") {
          onAuthExpired();
          return;
        }
        setRosterError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken, draft.roomId, draft.date, draft.shift, rosterTick]);

  const selectedRoomName = draft.roomId ? roomName(rooms, draft.roomId) : "";

  async function save() {
    if (!draft.roomId) {
      setError("Selecione uma sala.");
      return;
    }
    const problem = validateEntryDraft(draft, allowPastLimit);
    if (problem) {
      setError(problem);
      return;
    }
    const room = rooms.find((r) => r.id === draft.roomId);
    if (!room?.active) {
      setError("Esta sala está inativa. Escolha outra sala.");
      return;
    }
    const signature = draftSignature(draft);
    const requestId = pending && pending.signature === signature ? pending.id : api.newRequestId();
    if (!pending || pending.signature !== signature) setPending({ id: requestId, signature });

    setSaving(true);
    setError("");
    try {
      const result = await api.saveRecord(idToken, {
        id: draft.id ?? undefined,
        version: draft.version ?? undefined,
        requestId,
        roomId: draft.roomId,
        date: draft.date,
        shift: draft.shift,
        childName: draft.childName.trim(),
        age: draft.age,
        gender: draft.gender,
        tea: draft.tea,
        disability: draft.disability,
        disabilityNote: draft.disabilityNote.trim(),
        snackOk: draft.snackOk,
        snackNote: draft.snackNote.trim(),
        bathroom: draft.bathroom as Bathroom,
        bathroomNote: draft.bathroomNote.trim(),
        foodRestriction: draft.foodRestriction,
        foodRestrictionNote: draft.foodRestrictionNote.trim(),
        notes: draft.notes.trim(),
      });
      setPending(null);
      setSaved(result);
      setRosterTick((t) => t + 1);
      onSaved(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH") {
        onAuthExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function startFresh(keepRoomAndShift: boolean) {
    if (editTarget) onCancelEdit();
    setSelfEdit(null);
    setDraft((d) => emptyDraft(keepRoomAndShift ? d.roomId : allowedRooms[0]?.id || "", keepRoomAndShift ? d.date : today(), keepRoomAndShift ? d.shift : suggestedShift()));
    setStep(1);
    setSaved(null);
    setError("");
    setPending(null);
  }

  function cancelEdit() {
    if (selfEdit) {
      setSelfEdit(null);
      setDraft((d) => emptyDraft(d.roomId, d.date, d.shift));
      setStep(1);
      setSaved(null);
      setError("");
      setPending(null);
    } else {
      onCancelEdit();
    }
  }

  // Reversível: alterna "Voltou para a mesa" no próprio registro (até 3h da
  // criação) sem sair da lista. O servidor decide de verdade quem pode
  // alternar o quê e até quando; se recusar (ex. prazo vencido entre a lista
  // carregar e o clique), mostramos o erro devolvido por ele.
  async function toggleReturned(r: ApiRecord) {
    setTogglingId(r.id);
    setError("");
    try {
      const updated = await api.toggleReturned(idToken, r.id, api.newRequestId());
      setRoster((cur) => (cur ? cur.map((x) => (x.id === updated.id ? updated : x)) : cur));
      setDetail((d) => (d && d.id === updated.id ? updated : d));
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH") {
        onAuthExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Não foi possível atualizar agora. Tente novamente.");
    } finally {
      setTogglingId(null);
    }
  }

  if (allowedRooms.length === 0) {
    return (
      <div className="content">
        <p className="error-message" role="alert">
          Nenhuma sala ativa está vinculada ao seu usuário. Peça ao administrador para vincular uma sala ao seu cadastro.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">{effectiveEditTarget ? "CORREÇÃO DE REGISTRO" : "CHECK-IN DA CRIANÇA"}</p>
            <h1>Olá, {user.name.split(" ")[0]}!</h1>
            <p>{effectiveEditTarget ? "Ajuste os dados e confirme a correção." : "Registre a criança assim que ela chegar."}</p>
          </div>
          <div className="today-card">
            <CalendarDays size={21} />
            <div>
              <span>{draft.date === today() ? "Hoje" : "Data retroativa"}</span>
              <strong>{formatDateBR(draft.date)}</strong>
            </div>
            <div className="divider" />
            <Clock3 size={21} />
            <div>
              <span>Turno</span>
              <strong>{draft.shift}</strong>
            </div>
          </div>
        </div>

        {allowedRooms.length > 1 && (
          <div style={{ marginBottom: 18, maxWidth: 340 }}>
            <Choice label="Sala" value={draft.roomId} onChange={(v) => patch({ roomId: v })} options={allowedRooms.map((r) => r.id)} optionLabels={Object.fromEntries(allowedRooms.map((r) => [r.id, r.name]))} />
          </div>
        )}

        <div className="progress-wrap" aria-label={`Etapa ${step} de 3`}>
          {[1, 2, 3].map((item) => (
            <span key={item} className={item <= step ? "filled" : ""} />
          ))}
          <small>Etapa {step} de 3</small>
        </div>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        <section className="form-card">
          {saved ? (
            <div className="success-state">
              <div className="success-icon">
                <Check size={36} />
              </div>
              <p className="eyebrow">REGISTRO CONFIRMADO PELO SERVIDOR</p>
              <h2>{effectiveEditTarget ? "Correção salva!" : "Check-in registrado!"}</h2>
              <p>
                {saved.childName} · {formatDateBR(saved.date)} · {saved.shift} · {roomName(rooms, saved.roomId)}.
              </p>
              <div className="success-summary">
                <span>
                  <strong>{saved.age}</strong> anos
                </span>
                <span>
                  <strong>{saved.gender}</strong>
                </span>
                {saved.tea && (
                  <span>
                    <strong>TEA</strong>
                  </span>
                )}
              </div>
              <button className="primary" onClick={() => startFresh(true)}>
                Registrar próxima criança
              </button>
            </div>
          ) : step === 1 ? (
            <div className="step-content">
              <div className="illustration-dot">
                <Baby size={33} />
              </div>
              <p className="eyebrow">QUEM CHEGOU</p>
              <h2>Dados da criança</h2>
              <p>Informe o nome e a faixa etária/gênero em {selectedRoomName}.</p>
              <div className="entry-grid">
                <label className="field entry-grid-full">
                  Nome da criança
                  <input type="text" maxLength={150} autoFocus value={draft.childName} onChange={(e) => patch({ childName: e.target.value })} placeholder="Nome completo" />
                </label>
                <Choice label="Faixa etária" value={draft.age} onChange={(v) => patch({ age: v })} options={ages} />
                <Choice label="Gênero" value={draft.gender} onChange={(v) => patch({ gender: v })} options={genders} />
              </div>
            </div>
          ) : step === 2 ? (
            <div className="step-content">
              <p className="eyebrow">CUIDADOS</p>
              <h2>Informações importantes para o atendimento</h2>
              <p>Essas respostas ajudam a equipe a cuidar de {draft.childName || "cada criança"} com segurança.</p>
              <div className="care-grid">
                <div className="care-item">
                  <ShieldCheck size={20} />
                  <YesNo label="Criança com TEA" value={draft.tea} onChange={(v) => patch({ tea: v })} />
                </div>
                <div className="care-item">
                  <Accessibility size={20} />
                  <YesNo label="Possui alguma deficiência física" value={draft.disability} onChange={(v) => patch({ disability: v })} />
                  {draft.disability && <NoteField label="Detalhe da deficiência" value={draft.disabilityNote} onChange={(v) => patch({ disabilityNote: v })} placeholder="Descreva brevemente" />}
                </div>
                <div className="care-item">
                  <Utensils size={20} />
                  <YesNo label="Pode oferecer lanche" value={draft.snackOk} onChange={(v) => patch({ snackOk: v })} />
                  {!draft.snackOk && <NoteField label="Detalhe do lanche" value={draft.snackNote} onChange={(v) => patch({ snackNote: v })} placeholder="Motivo, se quiser registrar" />}
                </div>
                <div className="care-item">
                  <Salad size={20} />
                  <YesNo label="Tem restrição alimentar" value={draft.foodRestriction} onChange={(v) => patch({ foodRestriction: v })} />
                  {draft.foodRestriction && <NoteField label="Detalhe da restrição alimentar" value={draft.foodRestrictionNote} onChange={(v) => patch({ foodRestrictionNote: v })} placeholder="Ex.: alergia a amendoim" />}
                </div>
                <div className="care-item care-item-wide">
                  <PhoneCall size={20} />
                  <Choice
                    label="Se precisar ir ao banheiro"
                    value={draft.bathroom}
                    onChange={(v) => patch({ bathroom: v as Bathroom })}
                    options={bathroomOptions.map((o) => o.value)}
                    optionLabels={Object.fromEntries(bathroomOptions.map((o) => [o.value, o.label]))}
                  />
                  {draft.bathroom && <NoteField label="Detalhe do banheiro" value={draft.bathroomNote} onChange={(v) => patch({ bathroomNote: v })} />}
                </div>
              </div>
            </div>
          ) : (
            <div className="step-content review-step">
              <p className="eyebrow">REVISÃO</p>
              <h2>Confira antes de confirmar</h2>
              <p>Se precisar, volte e ajuste os dados.</p>
              <div className="review-grid">
                <div>
                  <Baby size={22} />
                  <span>
                    Criança
                    <strong>{draft.childName || "—"}</strong>
                  </span>
                </div>
                <div>
                  <ShieldCheck size={22} />
                  <span>
                    Idade / gênero
                    <strong>
                      {draft.age || "—"} · {draft.gender || "—"}
                    </strong>
                  </span>
                </div>
                <div>
                  <CalendarDays size={22} />
                  <span>
                    Data e turno
                    <strong>
                      {formatDateBR(draft.date)} · {draft.shift}
                    </strong>
                  </span>
                </div>
                <div>
                  <CalendarDays size={22} />
                  <span>
                    Sala
                    <strong>{selectedRoomName}</strong>
                  </span>
                </div>
                <div>
                  <ShieldCheck size={22} />
                  <span>
                    TEA / deficiência
                    <strong>
                      {draft.tea ? "Sim" : "Não"} · {draft.disability ? "Sim" : "Não"}
                    </strong>
                  </span>
                </div>
                <div>
                  <Utensils size={22} />
                  <span>
                    Lanche / restrição
                    <strong>
                      {draft.snackOk ? "Pode oferecer" : "Não oferecer"} · {draft.foodRestriction ? "Tem restrição" : "Sem restrição"}
                    </strong>
                  </span>
                </div>
                <div>
                  <PhoneCall size={22} />
                  <span>
                    Banheiro
                    <strong>{bathroomOptions.find((o) => o.value === draft.bathroom)?.label || "—"}</strong>
                  </span>
                </div>
              </div>
              <label className="notes">
                Observação geral <span>opcional</span>
                <textarea maxLength={500} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Alguma outra informação relevante para a equipe." />
              </label>
            </div>
          )}

          {!saved && (
            <footer className="form-actions">
              <button className="secondary" type="button" disabled={step === 1 || saving} onClick={() => setStep((s) => Math.max(1, s - 1))}>
                <ChevronLeft size={19} />
                Voltar
              </button>
              {effectiveEditTarget && (
                <button className="secondary" type="button" onClick={cancelEdit} disabled={saving}>
                  Cancelar correção
                </button>
              )}
              {step < 3 ? (
                <button className="primary" type="button" onClick={() => setStep((s) => Math.min(3, s + 1))}>
                  Continuar
                  <ChevronRight size={19} />
                </button>
              ) : (
                <button className="primary confirm" type="button" disabled={saving} onClick={save}>
                  {saving ? <Loader2 size={19} className="spin" /> : <Check size={19} />}
                  {editTarget ? "Confirmar correção" : "Confirmar check-in"}
                </button>
              )}
            </footer>
          )}
        </section>

        {!effectiveEditTarget && (
          <>
            <div className="bottom-links">
              <button type="button" onClick={() => setDateOpen(true)}>
                <CalendarDays size={18} />
                Registrar em outra data/turno
              </button>
              <span>{allowPastLimit != null ? `Você pode registrar os últimos ${allowPastLimit} dias` : "Como administrador, você pode registrar qualquer data passada"}</span>
            </div>

            <section className="shift-roster">
              <header>
                <Sparkles size={16} />
                <span>
                  Crianças já registradas nesta sala/turno {roster != null && `(${roster.length})`}
                </span>
                <button type="button" aria-label="Atualizar lista" onClick={() => setRosterTick((t) => t + 1)}>
                  <RefreshCw size={14} />
                </button>
              </header>
              {rosterError ? (
                <p className="roster-empty">Não foi possível carregar a lista agora.</p>
              ) : roster == null ? (
                <p className="roster-empty">Carregando…</p>
              ) : roster.length === 0 ? (
                <p className="roster-empty">Nenhuma criança registrada ainda neste turno.</p>
              ) : (
                <ul>
                  {roster.map((r) => {
                    const own = r.createdBy === user.uid;
                    const canQuickEdit = own && minutesSince(r.createdAt) <= 120;
                    const canToggleReturned = own && minutesSince(r.createdAt) <= 180;
                    return (
                      <li key={r.id} className="roster-item-clickable" onClick={() => setDetail(r)}>
                        <strong>
                          {r.childName}
                          {r.returnedToDesk && <span className="roster-badge">Voltou para a mesa</span>}
                        </strong>
                        <span>
                          {r.age} · {r.gender}
                        </span>
                        <span className="roster-tags">
                          {careSummary(r, false).map((f) => (
                            <em key={f}>{f}</em>
                          ))}
                        </span>
                        {(canQuickEdit || canToggleReturned) && (
                          <span className="roster-item-actions">
                            {canQuickEdit && (
                              <button
                                type="button"
                                className="roster-action"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelfEdit(r);
                                }}
                              >
                                <Pencil size={13} />
                                Editar
                              </button>
                            )}
                            {canToggleReturned && (
                              <button
                                type="button"
                                className="roster-action"
                                disabled={togglingId === r.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleReturned(r);
                                }}
                              >
                                {togglingId === r.id ? <Loader2 size={13} className="spin" /> : <Undo2 size={13} />}
                                {r.returnedToDesk ? "Desmarcar" : "Voltou p/ mesa"}
                              </button>
                            )}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="roster-note">
                {user.role === "operador"
                  ? "Toque num item da lista para ver todos os detalhes. Você pode editar ou marcar \"Voltou para a mesa\" nos seus próprios registros por um tempo limitado; depois disso, peça a um(a) gestor(a) ou administrador(a)."
                  : "Toque num item da lista para ver todos os detalhes, ou use Histórico e gestão para corrigir qualquer registro."}
              </p>
            </section>
          </>
        )}
      </div>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent>
          <DialogTitle>Data e turno do atendimento</DialogTitle>
          <DialogDescription>
            {allowPastLimit != null ? `Você pode registrar e corrigir os últimos ${allowPastLimit} dias.` : "Como administrador, você pode registrar qualquer data passada."}
          </DialogDescription>
          <label className="field">
            Data
            <input type="date" value={draft.date} min={allowPastLimit != null ? daysAgo(allowPastLimit) : undefined} max={today()} onChange={(e) => patch({ date: e.target.value })} />
          </label>
          <Choice label="Turno" value={draft.shift} onChange={(v) => patch({ shift: v })} options={shifts} />
          <button
            className="action-button"
            type="button"
            onClick={() => {
              setSaved(null);
              setStep(1);
              setDateOpen(false);
            }}
          >
            Usar data e turno
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogTitle>{detail.childName}</DialogTitle>
              <DialogDescription>
                {detail.age} · {detail.gender} · {formatDateBR(detail.date)} · {detail.shift} · {roomName(rooms, detail.roomId)}
              </DialogDescription>
              <div className="detail-grid">
                <div>
                  <span>TEA</span>
                  <strong>{detail.tea ? "Sim" : "Não"}</strong>
                </div>
                <div>
                  <span>Deficiência física</span>
                  <strong>{detail.disability ? "Sim" : "Não"}</strong>
                  {detail.disability && detail.disabilityNote && <p>{detail.disabilityNote}</p>}
                </div>
                <div>
                  <span>Lanche</span>
                  <strong>{detail.snackOk ? "Pode oferecer" : "Sem lanche liberado"}</strong>
                  {!detail.snackOk && detail.snackNote && <p>{detail.snackNote}</p>}
                </div>
                <div>
                  <span>Banheiro</span>
                  <strong>{bathroomOptions.find((o) => o.value === detail.bathroom)?.label || "—"}</strong>
                  {detail.bathroomNote && <p>{detail.bathroomNote}</p>}
                </div>
                <div>
                  <span>Restrição alimentar</span>
                  <strong>{detail.foodRestriction ? "Sim" : "Não"}</strong>
                  {detail.foodRestriction && detail.foodRestrictionNote && <p>{detail.foodRestrictionNote}</p>}
                </div>
                <div>
                  <span>Voltou para a mesa</span>
                  <strong>{detail.returnedToDesk ? "Sim" : "Não"}</strong>
                </div>
                {detail.notes && (
                  <div className="detail-grid-full">
                    <span>Observação geral</span>
                    <p>{detail.notes}</p>
                  </div>
                )}
                <div className="detail-grid-full detail-meta">
                  <span>
                    Registrado {detail.createdBy === user.uid ? "por você" : "por outra pessoa da equipe"}
                    {detail.version > 1 ? " · corrigido depois do registro original" : ""}.
                  </span>
                </div>
              </div>
              {detail.createdBy === user.uid && minutesSince(detail.createdAt) <= 180 && (
                <div className="detail-actions">
                  {detail.createdBy === user.uid && minutesSince(detail.createdAt) <= 120 && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setSelfEdit(detail);
                        setDetail(null);
                      }}
                    >
                      <Pencil size={16} />
                      Editar registro
                    </button>
                  )}
                  {detail.createdBy === user.uid && minutesSince(detail.createdAt) <= 180 && (
                    <button type="button" className="secondary" disabled={togglingId === detail.id} onClick={() => toggleReturned(detail)}>
                      {togglingId === detail.id ? <Loader2 size={16} className="spin" /> : <Undo2 size={16} />}
                      {detail.returnedToDesk ? "Desmarcar \"voltou para a mesa\"" : "Marcar \"voltou para a mesa\""}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
