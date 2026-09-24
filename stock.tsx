"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Candy, Check, Loader2, Pencil, RefreshCw } from "lucide-react";
import * as api from "./api";
import { ApiError, type ApiRoom, type ApiStockEntry, type ApiUser } from "./api";
import { STOCK_ITEMS, daysAgo, emptyStockQty, formatDateBR, roomName, stockQtyFromEntry, stockSignature, today, validateStockQty } from "./model";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Choice } from "./choice";

// Grade dos 16 insumos fixos, usada tanto no lançamento diário quanto no
// ajuste. `disabled` trava os campos quando quem está olhando não pode
// editar (ex.: operador vendo um lançamento já enviado). `playful` dá o
// visual colorido/arredondado do lançamento do dia a dia (o que a
// recreadora usa); o ajuste de gestor/admin fica no visual sóbrio padrão.
function QuantityGrid({ qty, onChange, disabled, playful }: { qty: Record<string, number>; onChange: (key: string, value: number) => void; disabled?: boolean; playful?: boolean }) {
  return (
    <div className={playful ? "stock-grid playful" : "stock-grid"}>
      {STOCK_ITEMS.map((item) => (
        <label className="field" key={item.key}>
          {item.label}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            disabled={disabled}
            value={Number.isFinite(qty[item.key]) ? qty[item.key] : 0}
            onChange={(e) => onChange(item.key, Math.max(0, Math.min(9999, Math.round(Number(e.target.value) || 0))))}
          />
        </label>
      ))}
    </div>
  );
}

export default function Stock({
  user,
  idToken,
  rooms,
  onAuthExpired,
}: {
  user: ApiUser;
  idToken: string;
  rooms: ApiRoom[];
  onAuthExpired: (message?: string) => void;
}) {
  const isAdmin = user.role === "admin";
  const isGestor = user.role === "gestor";
  const canAdjust = isAdmin || isGestor;
  const allowPastLimit = isAdmin ? null : 7;
  const myRooms = useMemo(() => rooms.filter((r) => r.active && (isAdmin || user.roomIds.includes(r.id))), [rooms, user, isAdmin]);
  const roomsInScope = isAdmin ? rooms.filter((r) => r.active) : myRooms;

  // Revisão da tela de estoque (pedido do cliente em 24/09/2026): em vez de
  // uma rolagem longa só, gestor/admin navegam por sub-abas (Hoje / Ajustar
  // / Consolidado — este último só admin). Operador continua vendo só o
  // cartão "Hoje", sem sub-abas visíveis (a lista tem 1 item só e o mesmo
  // componente Tabs já esconde a barra nesse caso, igual acontece hoje nas
  // abas principais da tela de gestão).
  const subTabs = canAdjust ? ["Hoje", "Ajustar", ...(isAdmin ? ["Consolidado"] : [])] : ["Hoje"];
  const [subTab, setSubTab] = useState<string>("Hoje");

  const authGuard = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.code === "AUTH") {
        onAuthExpired("Sua sessão expirou. Entre novamente.");
        return true;
      }
      return false;
    },
    [onAuthExpired]
  );

  // ---- Lançamento de hoje (uma sala por vez) ----
  const [roomId, setRoomId] = useState(myRooms[0]?.id || "");
  const [todayEntry, setTodayEntry] = useState<ApiStockEntry | null | undefined>(undefined); // undefined = carregando
  const [todayError, setTodayError] = useState("");
  const [editingToday, setEditingToday] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(emptyStockQty());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{ id: string; signature: string } | null>(null);

  const loadToday = useCallback(async () => {
    if (!roomId) {
      setTodayEntry(null);
      return;
    }
    setTodayEntry(undefined);
    setTodayError("");
    try {
      const { entries } = await api.stockList(idToken, { from: today(), to: today(), roomId });
      setTodayEntry(entries[0] || null);
    } catch (err) {
      if (authGuard(err)) return;
      setTodayError(err instanceof ApiError ? err.message : "Não foi possível verificar o lançamento de hoje.");
      setTodayEntry(null);
    }
  }, [idToken, roomId, authGuard]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  useEffect(() => {
    setSaved(false);
    setFormError("");
    setEditingToday(false);
    if (todayEntry) setQty(stockQtyFromEntry(todayEntry));
    else setQty(emptyStockQty());
    setNotes(todayEntry?.notes || "");
  }, [todayEntry]);

  // "X de Y salas já lançaram hoje": só para quem acompanha mais de uma sala
  // (gestor/admin). Busca leve, reaproveitando stock.list sem roomId (o
  // servidor já limita ao escopo de salas de quem está pedindo).
  const [todayAllEntries, setTodayAllEntries] = useState<ApiStockEntry[] | null>(null);
  const [summaryTick, setSummaryTick] = useState(0);
  useEffect(() => {
    if (!canAdjust) {
      setTodayAllEntries(null);
      return;
    }
    let cancelled = false;
    api
      .stockList(idToken, { from: today(), to: today() })
      .then((res) => {
        if (!cancelled) setTodayAllEntries(res.entries);
      })
      .catch(() => {
        if (!cancelled) setTodayAllEntries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canAdjust, idToken, summaryTick]);
  const launchedRoomIds = useMemo(() => new Set((todayAllEntries || []).map((e) => e.roomId)), [todayAllEntries]);
  const launchedCount = roomsInScope.filter((r) => launchedRoomIds.has(r.id)).length;

  function patchQty(key: string, value: number) {
    setQty((q) => ({ ...q, [key]: value }));
  }

  async function submitToday() {
    if (!roomId) {
      setFormError("Selecione a sala.");
      return;
    }
    const problem = validateStockQty(qty);
    if (problem) {
      setFormError(problem);
      return;
    }
    const id = todayEntry?.id ?? null;
    const version = todayEntry?.version ?? null;
    const signature = stockSignature(id, version, roomId, today(), qty, notes);
    const requestId = pending && pending.signature === signature ? pending.id : api.newRequestId();
    if (!pending || pending.signature !== signature) setPending({ id: requestId, signature });

    setSaving(true);
    setFormError("");
    try {
      const result = await api.stockSave(idToken, {
        id: id ?? undefined,
        version: version ?? undefined,
        requestId,
        roomId,
        date: today(),
        qty,
        notes: notes.trim(),
      });
      setPending(null);
      setSaved(true);
      setEditingToday(false);
      setTodayEntry(result);
      setSummaryTick((t) => t + 1);
    } catch (err) {
      if (authGuard(err)) return;
      setFormError(err instanceof ApiError ? err.message : "Não foi possível salvar o lançamento agora.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Ajuste de lançamentos anteriores (gestor/admin) ----
  const [histStart, setHistStart] = useState(daysAgo(7));
  const [histEnd, setHistEnd] = useState(today());
  const [histRoom, setHistRoom] = useState("");
  const [histEntries, setHistEntries] = useState<ApiStockEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<ApiStockEntry | null>(null);
  const [adjustQty, setAdjustQty] = useState<Record<string, number>>(emptyStockQty());
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [adjustPending, setAdjustPending] = useState<{ id: string; signature: string } | null>(null);

  const loadHistory = useCallback(async () => {
    if (!canAdjust || histStart > histEnd) return;
    setHistLoading(true);
    setHistError("");
    try {
      const { entries } = await api.stockList(idToken, { from: histStart, to: histEnd, roomId: histRoom || undefined });
      setHistEntries(entries);
    } catch (err) {
      if (authGuard(err)) return;
      setHistError(err instanceof ApiError ? err.message : "Não foi possível carregar os lançamentos.");
    } finally {
      setHistLoading(false);
    }
  }, [canAdjust, idToken, histStart, histEnd, histRoom, authGuard]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function openAdjust(entry: ApiStockEntry) {
    setAdjustTarget(entry);
    setAdjustQty(stockQtyFromEntry(entry));
    setAdjustNotes(entry.notes);
    setAdjustError("");
    setAdjustPending(null);
  }

  function canAdjustEntry(entry: ApiStockEntry) {
    return isAdmin || entry.date >= daysAgo(7);
  }

  async function saveAdjust() {
    if (!adjustTarget) return;
    const problem = validateStockQty(adjustQty);
    if (problem) {
      setAdjustError(problem);
      return;
    }
    const signature = stockSignature(adjustTarget.id, adjustTarget.version, adjustTarget.roomId, adjustTarget.date, adjustQty, adjustNotes);
    const requestId = adjustPending && adjustPending.signature === signature ? adjustPending.id : api.newRequestId();
    if (!adjustPending || adjustPending.signature !== signature) setAdjustPending({ id: requestId, signature });

    setAdjustSaving(true);
    setAdjustError("");
    try {
      await api.stockSave(idToken, {
        id: adjustTarget.id,
        version: adjustTarget.version,
        requestId,
        roomId: adjustTarget.roomId,
        date: adjustTarget.date,
        qty: adjustQty,
        notes: adjustNotes.trim(),
      });
      setAdjustPending(null);
      setAdjustTarget(null);
      await loadHistory();
      if (adjustTarget.roomId === roomId && adjustTarget.date === today()) await loadToday();
      if (adjustTarget.date === today()) setSummaryTick((t) => t + 1);
    } catch (err) {
      if (authGuard(err)) return;
      setAdjustError(err instanceof ApiError ? err.message : "Não foi possível salvar o ajuste agora.");
    } finally {
      setAdjustSaving(false);
    }
  }

  // ---- Visão consolidada (macro), só admin ----
  const [macroStart, setMacroStart] = useState(daysAgo(30));
  const [macroEnd, setMacroEnd] = useState(today());
  const [macroEntries, setMacroEntries] = useState<ApiStockEntry[]>([]);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState("");

  const loadMacro = useCallback(async () => {
    if (!isAdmin || macroStart > macroEnd) return;
    setMacroLoading(true);
    setMacroError("");
    try {
      const { entries } = await api.stockList(idToken, { from: macroStart, to: macroEnd });
      setMacroEntries(entries);
    } catch (err) {
      if (authGuard(err)) return;
      setMacroError(err instanceof ApiError ? err.message : "Não foi possível carregar o consolidado.");
    } finally {
      setMacroLoading(false);
    }
  }, [isAdmin, idToken, macroStart, macroEnd, authGuard]);

  useEffect(() => {
    loadMacro();
  }, [loadMacro]);

  const macroTotals = useMemo(() => {
    const totals = emptyStockQty();
    macroEntries.forEach((e) => STOCK_ITEMS.forEach((i) => (totals[i.key] += Number(e.qty[i.key] || 0))));
    return totals;
  }, [macroEntries]);

  if (myRooms.length === 0 && !isAdmin) {
    return (
      <p className="error-message" role="alert">
        Nenhuma sala ativa está vinculada ao seu usuário. Peça ao administrador para vincular uma sala ao seu cadastro.
      </p>
    );
  }

  const lockedForOperador = !canAdjust && !!todayEntry && !editingToday;

  return (
    <>
      {subTabs.length > 1 && (
        <Tabs value={subTab} onValueChange={setSubTab}>
          <TabsList className="management-tabs" aria-label="Seções de estoque">
            {subTabs.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {subTab === "Hoje" && (
      <div className="stock-hero">
        <div className="stock-hero-icon">
          <Candy size={26} />
        </div>
        <h2 style={{ margin: 0 }}>Saída de estoque de hoje</h2>

        {canAdjust && todayAllEntries != null && (
          <p className="stock-launch-summary">
            {launchedCount} de {roomsInScope.length} salas já lançaram o estoque de hoje.
          </p>
        )}

        {(myRooms.length > 1 || isAdmin) && (
          <div style={{ marginTop: 16, marginBottom: 4, maxWidth: 340 }}>
            <Choice
              label="Sala"
              value={roomId}
              onChange={setRoomId}
              options={(isAdmin ? rooms.filter((r) => r.active) : myRooms).map((r) => r.id)}
              optionLabels={Object.fromEntries((isAdmin ? rooms.filter((r) => r.active) : myRooms).map((r) => [r.id, r.name]))}
            />
          </div>
        )}

        {!roomId ? (
          <p className="empty-message">Selecione uma sala para lançar ou conferir a saída de hoje.</p>
        ) : todayEntry === undefined ? (
          <p className="data-note">
            <Loader2 size={16} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} />
            Carregando…
          </p>
        ) : (
          <>
            {todayError && (
              <p className="error-message" role="alert">
                {todayError}{" "}
                <button className="link-button" onClick={loadToday}>
                  Tentar novamente
                </button>
              </p>
            )}

            {todayEntry && !editingToday && (
              <p className="data-note">
                Lançamento de hoje ({formatDateBR(today())}) já enviado por {todayEntry.createdBy === user.uid ? "você" : "uma recreadora desta sala"}.{" "}
                {canAdjust
                  ? "Como você pode ajustar, os campos abaixo mostram os valores já enviados."
                  : "Só um(a) gestor(a) ou administrador(a) pode ajustar um lançamento já enviado."}
              </p>
            )}

            {saved && (
              <p className="data-note">
                <Check size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
                Lançamento salvo com sucesso.
              </p>
            )}

            {formError && (
              <p className="error-message" role="alert">
                {formError}
              </p>
            )}

            <QuantityGrid qty={qty} onChange={patchQty} disabled={lockedForOperador || saving} playful />

            <label className="field" style={{ maxWidth: 480, marginTop: 18 }}>
              Observação <span className="optional-tag">opcional</span>
              <input type="text" maxLength={500} value={notes} disabled={lockedForOperador || saving} onChange={(e) => setNotes(e.target.value)} />
            </label>

            {!lockedForOperador && (
              <button className="stock-submit" disabled={saving} onClick={submitToday}>
                {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                {saving ? "Salvando…" : todayEntry ? "Salvar ajuste de hoje" : "Confirmar saída de hoje"}
              </button>
            )}
            {lockedForOperador && canAdjust === false && (
              <p className="roster-note" style={{ marginTop: 10 }}>
                Volte amanhã para o próximo lançamento, ou peça a um(a) gestor(a) para ajustar este.
              </p>
            )}
          </>
        )}
      </div>
      )}

      {subTab === "Ajustar" && canAdjust && (
        <>
          <div className="export-actions" style={{ marginTop: 20 }}>
            <h2>Ajustar lançamentos</h2>
          </div>
          {todayAllEntries != null && (
            <p className="stock-launch-summary" style={{ marginTop: -6 }}>
              {launchedCount} de {roomsInScope.length} salas já lançaram o estoque de hoje.
            </p>
          )}
          <div className="filters">
            <label className="field">
              De
              <input type="date" value={histStart} max={histEnd} onChange={(e) => setHistStart(e.target.value)} />
            </label>
            <label className="field">
              Até
              <input type="date" value={histEnd} min={histStart} max={today()} onChange={(e) => setHistEnd(e.target.value)} />
            </label>
            <Choice
              label="Sala"
              value={histRoom}
              onChange={setHistRoom}
              options={["", ...(isAdmin ? rooms : myRooms).map((r) => r.id)]}
              optionLabels={{ "": isAdmin ? "Todas" : "Todas as minhas salas", ...Object.fromEntries((isAdmin ? rooms : myRooms).map((r) => [r.id, r.name])) }}
            />
            <button onClick={loadHistory}>
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
          {histLoading && <p className="data-note">Carregando…</p>}
          {histError && (
            <p className="error-message" role="alert">
              {histError}
            </p>
          )}
          {!histLoading && !histError && (
            <>
              {histEntries.length === 0 ? (
                <p className="empty-message">Nenhum lançamento neste período e sala.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Data", "Sala", "Versão", "Última atualização", ""].map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {histEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{formatDateBR(e.date)}</TableCell>
                        <TableCell>{roomName(rooms, e.roomId)}</TableCell>
                        <TableCell>{e.version === 1 ? "Original" : `Ajustado (v${e.version})`}</TableCell>
                        <TableCell>{new Date(e.updatedAt).toLocaleString("pt-BR")}</TableCell>
                        <TableCell>
                          <button className="link-button" disabled={!canAdjustEntry(e)} onClick={() => openAdjust(e)}>
                            <Pencil size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                            Ajustar
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </>
      )}

      {subTab === "Consolidado" && isAdmin && (
        <>
          <div className="export-actions" style={{ marginTop: 20 }}>
            <h2>Consolidado de todas as salas</h2>
          </div>
          <div className="filters">
            <label className="field">
              De
              <input type="date" value={macroStart} max={macroEnd} onChange={(e) => setMacroStart(e.target.value)} />
            </label>
            <label className="field">
              Até
              <input type="date" value={macroEnd} min={macroStart} max={today()} onChange={(e) => setMacroEnd(e.target.value)} />
            </label>
          </div>
          {macroLoading && <p className="data-note">Carregando…</p>}
          {macroError && (
            <p className="error-message" role="alert">
              {macroError}
            </p>
          )}
          {!macroLoading && !macroError && (
            <>
              <p className="data-note">
                Soma da saída de todas as salas ativas entre {formatDateBR(macroStart)} e {formatDateBR(macroEnd)}, com base em {macroEntries.length} lançamento(s) diário(s).
              </p>
              <div className="stock-summary">
                {STOCK_ITEMS.map((item) => (
                  <article key={item.key}>
                    <span>{item.label}</span>
                    <strong>{macroTotals[item.key]}</strong>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent>
          <DialogTitle>Ajustar lançamento de estoque</DialogTitle>
          <DialogDescription>
            {adjustTarget && `${roomName(rooms, adjustTarget.roomId)} · ${formatDateBR(adjustTarget.date)}. Sala e data não podem ser alteradas num ajuste.`}
          </DialogDescription>
          {adjustTarget && (
            <>
              <QuantityGrid qty={adjustQty} onChange={(key, value) => setAdjustQty((q) => ({ ...q, [key]: value }))} disabled={adjustSaving} />
              <label className="field" style={{ marginTop: 14 }}>
                Observação <span className="optional-tag">opcional</span>
                <input type="text" maxLength={500} value={adjustNotes} disabled={adjustSaving} onChange={(e) => setAdjustNotes(e.target.value)} />
              </label>
              {adjustError && (
                <p className="error-message" role="alert">
                  {adjustError}
                </p>
              )}
              <button className="action-button" style={{ marginTop: 14 }} disabled={adjustSaving} onClick={saveAdjust}>
                {adjustSaving ? "Salvando…" : "Salvar ajuste"}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
