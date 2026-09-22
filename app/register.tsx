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
  PhoneCall,
  RefreshCw,
  Salad,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";
import * as api from "./api";
import { ApiError, type ApiRecord, type ApiRoom, type ApiUser, type Bathroom } from "./api";
import { ages, bathroomOptions, careSummary, daysAgo, draftSignature, emptyDraft, formatDateBR, genders, roomName, shifts, suggestedShift, today, validateEntryDraft, type EntryDraft } from "./model";
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

  // Lista de quem já foi registrado nesta sala/data/turno, só para conferência
  // visual da recreadora (evitar duplicar/perder a conta) — não é editável
  // aqui; correções continuam pelo Histórico e gestão.
  const [roster, setRoster] = useState<ApiRecord[] | null>(null);
  const [rosterError, setRosterError] = useState(false);
  const [rosterTick, setRosterTick] = useState(0);

  function patch(fields: Partial<EntryDraft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  useEffect(() => {
    if (editTarget) {
      setDraft(draftFromRecord(editTarget));
      setStep(1);
      setSaved(null);
      setError("");
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget?.id, editTarget?.version]);

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
    onCancelEdit();
    setDraft((d) => emptyDraft(keepRoomAndShift ? d.roomId : allowedRooms[0]?.id || "", keepRoomAndShift ? d.date : today(), keepRoomAndShift ? d.shift : suggestedShift()));
    setStep(1);
    setSaved(null);
    setError("");
    setPending(null);
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
            <p className="eyebrow">{editTarget ? "CORREÇÃO DE REGISTRO" : "CHECK-IN DA CRIANÇA"}</p>
            <h1>Olá, {user.name.split(" ")[0]}!</h1>
            <p>{editTarget ? "Ajuste os dados e confirme a correção." : "Registre a criança assim que ela chegar."}</p>
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
              <h2>{editTarget ? "Correção salva!" : "Check-in registrado!"}</h2>
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
              {editTarget && (
                <button className="secondary" type="button" onClick={onCancelEdit} disabled={saving}>
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

        {!editTarget && (
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
                  {roster.map((r) => (
                    <li key={r.id}>
                      <strong>{r.childName}</strong>
                      <span>
                        {r.age} · {r.gender}
                      </span>
                      <span className="roster-tags">
                        {careSummary(r, false).map((f) => (
                          <em key={f}>{f}</em>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="roster-note">Para corrigir um registro já salvo, use Histórico e gestão.</p>
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
    </>
  );
}
