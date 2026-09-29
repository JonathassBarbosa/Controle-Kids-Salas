// Modo offline (27/09/2026): a recreadora continua registrando crianças e o
// estoque do dia sem internet. Cada envio vira um item numa FILA guardada no
// próprio aparelho (localStorage) e é reenviado sozinho quando a conexão volta.
//
// Por que é seguro reenviar: records.save e stock.save do backend já são
// idempotentes por requestId — reenviar o mesmo item (mesmo requestId, mesmo
// conteúdo) nunca duplica o registro, mesmo que a primeira tentativa tenha
// chegado ao servidor e só a resposta tenha se perdido.
//
// Escopo combinado com o cliente: só CRIAÇÃO de check-in e do lançamento de
// estoque do dia vão para a fila. Editar e "Voltou para a mesa" continuam
// exigindo internet (ficam liberados assim que o registro sincroniza).
// Telas de gestor/admin também exigem internet.
import * as api from "./api";
import { ApiError, type ApiRecord, type MeResponse, type SaveRecordInput, type SaveStockInput } from "./api";

const OUTBOX_KEY = "gavkids.outbox.v1";
const ME_KEY = "gavkids.me.v1";
const ROSTER_KEY = "gavkids.roster.v1";
const EVENT = "gavkids-outbox";

export type OutboxItem =
  | { kind: "record"; requestId: string; uid: string; createdAt: string; attempts: number; status: "pending" | "failed"; error?: string; payload: SaveRecordInput }
  | { kind: "stock"; requestId: string; uid: string; createdAt: string; attempts: number; status: "pending" | "failed"; error?: string; payload: SaveStockInput };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------- Fila ----------
export function outbox(uid?: string): OutboxItem[] {
  const all = read<OutboxItem[]>(OUTBOX_KEY, []);
  return Array.isArray(all) ? all.filter((i) => !uid || i.uid === uid) : [];
}
function saveOutbox(items: OutboxItem[]) {
  const ok = write(OUTBOX_KEY, items);
  window.dispatchEvent(new CustomEvent(EVENT));
  return ok;
}
// Devolve false se o aparelho não conseguiu guardar (armazenamento cheio/bloqueado).
export function enqueueRecord(uid: string, payload: SaveRecordInput) {
  const items = outbox();
  if (items.some((i) => i.requestId === payload.requestId)) return true;
  items.push({ kind: "record", requestId: payload.requestId, uid, createdAt: new Date().toISOString(), attempts: 0, status: "pending", payload });
  return saveOutbox(items);
}
export function enqueueStock(uid: string, payload: SaveStockInput) {
  const items = outbox();
  if (items.some((i) => i.requestId === payload.requestId)) return true;
  items.push({ kind: "stock", requestId: payload.requestId, uid, createdAt: new Date().toISOString(), attempts: 0, status: "pending", payload });
  return saveOutbox(items);
}
export function discard(requestId: string) {
  saveOutbox(outbox().filter((i) => i.requestId !== requestId));
}
export function onOutboxChange(fn: () => void) {
  window.addEventListener(EVENT, fn);
  // Outra aba do mesmo aparelho mexeu na fila.
  const storage = (e: StorageEvent) => e.key === OUTBOX_KEY && fn();
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}

// Erros que indicam "sem conexão / servidor indisponível agora": o item fica
// na fila e tentamos de novo depois. Qualquer outro erro é uma recusa do
// servidor (regra de negócio) e o item vira "failed" para a recreadora ver.
export function isConnectivityError(err: unknown) {
  return err instanceof ApiError && ["OFFLINE", "TIMEOUT", "BUSY", "BAD_RESPONSE", "RATE_LIMIT"].includes(err.code);
}

// Registro "fantasma" para mostrar na lista da sala enquanto não sincroniza.
export function pendingRecordsFor(uid: string, roomId: string, date: string, shift: string, name = ""): (ApiRecord & { _pending: "pending" | "failed"; _error?: string })[] {
  return outbox(uid)
    .filter((i): i is Extract<OutboxItem, { kind: "record" }> => i.kind === "record")
    .filter((i) => i.payload.roomId === roomId && i.payload.date === date && i.payload.shift === shift)
    .map((i) => ({
      id: "pendente:" + i.requestId,
      version: 0,
      roomId: i.payload.roomId,
      date: i.payload.date,
      shift: i.payload.shift,
      childName: i.payload.childName,
      age: i.payload.age,
      gender: i.payload.gender,
      tea: i.payload.tea,
      disability: i.payload.disability,
      disabilityNote: i.payload.disabilityNote || "",
      snackOk: i.payload.snackOk,
      snackNote: i.payload.snackNote || "",
      bathroom: i.payload.bathroom,
      bathroomNote: i.payload.bathroomNote || "",
      foodRestriction: i.payload.foodRestriction,
      foodRestrictionNote: i.payload.foodRestrictionNote || "",
      notes: i.payload.notes || "",
      returnedToDesk: false,
      createdBy: uid,
      createdByName: name,
      createdAt: i.createdAt,
      updatedBy: uid,
      updatedByName: name,
      updatedAt: i.createdAt,
      _pending: i.status,
      _error: i.error,
    }));
}
export function pendingStockFor(uid: string, roomId: string, date: string) {
  return outbox(uid).find((i): i is Extract<OutboxItem, { kind: "stock" }> => i.kind === "stock" && i.payload.roomId === roomId && i.payload.date === date) || null;
}

// ---------- Sincronização ----------
export type SyncResult = { sent: number; failed: number; remaining: number; authNeeded: boolean; offline: boolean };
let running: Promise<SyncResult> | null = null;

export function syncOutbox(idToken: string, uid: string): Promise<SyncResult> {
  if (!running) running = doSync(idToken, uid).finally(() => (running = null));
  return running;
}

async function doSync(idToken: string, uid: string): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, failed: 0, remaining: 0, authNeeded: false, offline: false };
  // Um item por vez, na ordem em que foram criados.
  for (const item of outbox(uid).filter((i) => i.status === "pending")) {
    try {
      if (item.kind === "record") {
        const rec = await api.saveRecord(idToken, item.payload);
        rememberRecord(rec);
      } else {
        await api.stockSave(idToken, item.payload);
      }
      saveOutbox(outbox().filter((i) => i.requestId !== item.requestId));
      result.sent++;
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH") {
        result.authNeeded = true;
        break;
      }
      if (isConnectivityError(err)) {
        result.offline = true;
        bump(item.requestId);
        break;
      }
      // Recusa do servidor (ex.: prazo, sala sem acesso, estoque do dia já lançado por outra pessoa).
      const message = err instanceof ApiError ? err.message : "Não foi possível enviar.";
      saveOutbox(outbox().map((i) => (i.requestId === item.requestId ? { ...i, status: "failed" as const, error: message, attempts: i.attempts + 1 } : i)));
      result.failed++;
    }
  }
  result.remaining = outbox(uid).filter((i) => i.status === "pending").length;
  return result;
}
function bump(requestId: string) {
  const items = outbox();
  const idx = items.findIndex((i) => i.requestId === requestId);
  if (idx >= 0) {
    items[idx] = { ...items[idx], attempts: items[idx].attempts + 1 };
    write(OUTBOX_KEY, items);
  }
}

// ---------- Caches para abrir o app sem internet ----------
export function saveMeCache(data: MeResponse) {
  write(ME_KEY, { savedAt: Date.now(), data });
}
export function loadMeCache(uid: string): MeResponse | null {
  const c = read<{ data?: MeResponse } | null>(ME_KEY, null);
  return c?.data?.user?.uid === uid ? c.data : null;
}
export function clearMeCache() {
  try {
    localStorage.removeItem(ME_KEY);
    localStorage.removeItem(ROSTER_KEY);
  } catch {
    // ignorar
  }
}

// Última lista conhecida de cada sala/data/turno (só os últimos 3 dias, para não crescer).
type RosterCache = Record<string, { savedAt: number; records: ApiRecord[] }>;
const rosterKey = (roomId: string, date: string, shift: string) => `${roomId}|${date}|${shift}`;
export function saveRosterCache(roomId: string, date: string, shift: string, records: ApiRecord[]) {
  const all = read<RosterCache>(ROSTER_KEY, {});
  all[rosterKey(roomId, date, shift)] = { savedAt: Date.now(), records };
  const cutoff = Date.now() - 3 * 86400000;
  for (const k of Object.keys(all)) if (all[k].savedAt < cutoff) delete all[k];
  write(ROSTER_KEY, all);
}
export function loadRosterCache(roomId: string, date: string, shift: string): ApiRecord[] | null {
  return read<RosterCache>(ROSTER_KEY, {})[rosterKey(roomId, date, shift)]?.records || null;
}
function rememberRecord(rec: ApiRecord) {
  const all = read<RosterCache>(ROSTER_KEY, {});
  const k = rosterKey(rec.roomId, rec.date, rec.shift);
  const cur = all[k]?.records || [];
  all[k] = { savedAt: Date.now(), records: [...cur.filter((r) => r.id !== rec.id), rec] };
  write(ROSTER_KEY, all);
}

