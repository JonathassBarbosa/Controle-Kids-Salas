// Cliente da API do GAV Kids (Apps Script v4, apps-script/Code.gs).
// Contrato: POST no /exec, corpo JSON, Content-Type text/plain;charset=utf-8
// (evita preflight CORS — não usar Authorization header, JSONP ou no-cors).
// Resposta sempre {ok:true,data} ou {ok:false,error:{code,message}}.
//
// v3: registro deixou de ser um total agregado por turno e passou a ser um
// lançamento por CRIANÇA, feito em tempo real assim que ela chega (nome,
// faixa etária/gênero de todas, TEA, deficiência física, se pode oferecer
// lanche, orientação de banheiro e restrição alimentar, cada um com nota
// opcional). Não há mais entrada/saída (só check-in) nem perfil reaproveitado
// entre atendimentos: cada chegada é um cadastro novo, mesmo para uma criança
// que já esteve aqui antes.
//
// v4: gestor(a) de sala agora pode cadastrar/editar suas próprias recreadoras
// (admin.users/admin.saveUser aceitam o papel gestor com escopo restrito às
// próprias salas). Acrescenta também o controle de estoque por sala
// (stock.save/stock.list/stock.history) — ver ApiStockEntry abaixo.
//
// v5: (a) apoio temporário entre salas — support.grant/support.revoke/
// support.list, ver ApiSupportGrant abaixo; enquanto ativo, a sala extra
// aparece em user.roomIds de "me" automaticamente (o backend já mescla,
// nada a fazer aqui além de reconsultar "me"/roomIds normalmente); (b)
// campo returnedToDesk em ApiRecord ("voltou para a mesa de apresentação"),
// alternado só pela nova ação records.toggleReturned — nunca por
// records.save, que sempre preserva o valor atual em correções.
import { loadConfig } from "./config";

export type Role = "operador" | "gestor" | "admin";

export interface ApiUser {
  uid: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  roomIds: string[];
  active: boolean;
}

export interface ApiRoom {
  id: string;
  name: string;
  active: boolean;
}

export type Bathroom = "pode_levar" | "chamar_responsavel";

export interface ApiRecord {
  id: string;
  version: number;
  roomId: string;
  date: string;
  shift: string;
  childName: string;
  age: string;
  gender: string;
  tea: boolean;
  disability: boolean;
  disabilityNote: string;
  snackOk: boolean;
  snackNote: string;
  bathroom: Bathroom;
  bathroomNote: string;
  foodRestriction: boolean;
  foodRestrictionNote: string;
  notes: string;
  returnedToDesk: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ApiSupportGrant {
  apoioId: string;
  uid: string;
  roomId: string;
  grantedBy: string;
  hours: number;
  createdAt: string;
  expiresAt: number;
  revoked: boolean;
  revokedAt: string;
  revokedBy: string;
}

export interface MeResponse {
  user: ApiUser;
  rooms: ApiRoom[];
  ages: string[];
  genders: string[];
  shifts: string[];
  stockItems: string[];
}

export interface ApiStockEntry {
  id: string;
  version: number;
  roomId: string;
  date: string;
  qty: Record<string, number>;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ListStockParams {
  from: string;
  to: string;
  roomId?: string;
}

export interface ListStockResponse {
  entries: ApiStockEntry[];
}

export interface SaveStockInput {
  id?: string;
  version?: number;
  requestId: string;
  roomId: string;
  date: string;
  qty: Record<string, number>;
  notes?: string;
}

export interface LoginResponse {
  idToken: string;
  token: string;
  expiresIn: string;
  user: ApiUser;
}

export interface ListRecordsParams {
  from: string;
  to: string;
  roomId?: string;
  shift?: string;
  age?: string;
  gender?: string;
  tea?: boolean;
  cursor?: number;
}

export interface ListRecordsResponse {
  records: ApiRecord[];
  nextCursor: number | null;
  totalRecords: number;
}

export interface SaveRecordInput {
  id?: string;
  version?: number;
  requestId: string;
  roomId: string;
  date: string;
  shift: string;
  childName: string;
  age: string;
  gender: string;
  tea: boolean;
  disability: boolean;
  disabilityNote?: string;
  snackOk: boolean;
  snackNote?: string;
  bathroom: Bathroom;
  bathroomNote?: string;
  foodRestriction: boolean;
  foodRestrictionNote?: string;
  notes?: string;
}

export interface SaveUserInput {
  uid?: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  roomIds: string[];
  active: boolean;
  password?: string;
}

export interface SaveRoomInput {
  id?: string;
  name: string;
  active: boolean;
}

// Códigos definidos no backend: AUTH, FORBIDDEN, VALIDATION, RATE_LIMIT, BUSY,
// MAIL_QUOTA, NOT_FOUND, INTERNAL. Acrescentamos códigos só do cliente:
// CONFIG (config.json sem apiUrl), OFFLINE (fetch falhou), TIMEOUT, BAD_RESPONSE.
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 25000; // ScriptLock do backend usa 20s; margem para round-trip.

async function call<T>(action: string, body: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const { apiUrl } = await loadConfig();
  if (!apiUrl) {
    throw new ApiError(
      "CONFIG",
      "A URL do backend (Apps Script) ainda não foi configurada neste site. Peça ao administrador para preencher config.json com a URL /exec."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("TIMEOUT", "O servidor demorou para responder. Verifique sua conexão e tente novamente.");
    }
    throw new ApiError("OFFLINE", "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.");
  }
  clearTimeout(timer);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", "O servidor respondeu de forma inesperada. Tente novamente em instantes.");
  }
  if (!json || typeof json !== "object" || typeof (json as Record<string, unknown>).ok !== "boolean") {
    throw new ApiError("BAD_RESPONSE", "O servidor respondeu de forma inesperada. Tente novamente em instantes.");
  }
  const parsed = json as { ok: boolean; data?: T; error?: { code?: string; message?: string } };
  if (!parsed.ok) {
    throw new ApiError(parsed.error?.code || "INTERNAL", parsed.error?.message || "Não foi possível concluir a operação.");
  }
  return parsed.data as T;
}

export function login(username: string, password: string) {
  return call<LoginResponse>("login", { username, password });
}
export function logout(idToken: string) {
  return call<{ message: string }>("logout", { idToken });
}
export function recover(username: string) {
  return call<{ message: string }>("recover", { username });
}
export function resetPassword(username: string, code: string, newPassword: string) {
  return call<{ message: string }>("resetPassword", { username, code, newPassword });
}
export function me(idToken: string) {
  return call<MeResponse>("me", { idToken });
}
export function listRecords(idToken: string, params: ListRecordsParams) {
  return call<ListRecordsResponse>("records.list", { idToken, ...params });
}
// records.list pagina de 200 em 200 e não garante um retrato consistente entre
// páginas se houver gravações simultâneas; ainda assim é o que a API oferece
// para somar totais/exportar, então buscamos todas as páginas em sequência.
export async function listAllRecords(idToken: string, params: Omit<ListRecordsParams, "cursor">) {
  const all: ApiRecord[] = [];
  let cursor: number | undefined = 0;
  let totalRecords = 0;
  for (;;) {
    const page = await listRecords(idToken, { ...params, cursor });
    all.push(...page.records);
    totalRecords = page.totalRecords;
    if (page.nextCursor == null) break;
    cursor = page.nextCursor;
  }
  return { records: all, totalRecords };
}
export function saveRecord(idToken: string, record: SaveRecordInput) {
  return call<ApiRecord>("records.save", { idToken, record });
}
export function recordHistory(idToken: string, recordId: string) {
  return call<ApiRecord[]>("records.history", { idToken, recordId });
}
// Alterna "Voltou para a mesa" (reversível). requestId novo a cada chamada —
// reenviar o MESMO requestId (ex. clique duplo) retorna o mesmo resultado
// sem alternar de novo. Prazo: operador só o próprio registro em até 3h;
// gestor/admin seguem o mesmo prazo de correção de records.save (7 dias /
// sem prazo).
export function toggleReturned(idToken: string, recordId: string, requestId: string) {
  return call<ApiRecord>("records.toggleReturned", { idToken, recordId, requestId });
}
// Apoio temporário entre salas: gestor concede a uma recreadora DAS SUAS
// PRÓPRIAS salas acesso a qualquer outra sala ativa por 12/24/48h; a sala
// concedida passa a aparecer em roomIds da recreadora (via "me") enquanto
// ativa, e some sozinha ao expirar. Admin pode conceder para qualquer
// recreadora.
export function supportGrant(idToken: string, uid: string, roomId: string, hours: 12 | 24 | 48) {
  return call<ApiSupportGrant>("support.grant", { idToken, uid, roomId, hours });
}
export function supportRevoke(idToken: string, apoioId: string) {
  return call<ApiSupportGrant>("support.revoke", { idToken, apoioId });
}
// Lista apoios visíveis ao chamador (admin: todos; gestor: os que concedeu +
// os de recreadoras das suas salas), incluindo ativos/expirados/revogados.
export function supportList(idToken: string) {
  return call<ApiSupportGrant[]>("support.list", { idToken });
}
export function adminUsers(idToken: string) {
  return call<ApiUser[]>("admin.users", { idToken });
}
export function adminRooms(idToken: string) {
  return call<ApiRoom[]>("admin.rooms", { idToken });
}
export function adminSaveUser(idToken: string, user: SaveUserInput) {
  return call<ApiUser>("admin.saveUser", { idToken, user });
}
export function adminSaveRoom(idToken: string, room: SaveRoomInput) {
  return call<ApiRoom>("admin.saveRoom", { idToken, room });
}
export function stockSave(idToken: string, entry: SaveStockInput) {
  return call<ApiStockEntry>("stock.save", { idToken, entry });
}
export function stockList(idToken: string, params: ListStockParams) {
  return call<ListStockResponse>("stock.list", { idToken, ...params });
}
export function stockHistory(idToken: string, recordId: string) {
  return call<ApiStockEntry[]>("stock.history", { idToken, recordId });
}
// Verifica se a URL /exec responde e está na versão esperada, sem autenticar.
export async function ping(): Promise<{ version: string } | null> {
  const { apiUrl } = await loadConfig();
  if (!apiUrl) return null;
  try {
    const res = await fetch(apiUrl, { method: "GET" });
    const json = (await res.json()) as { ok?: boolean; data?: { version?: string } };
    return json?.ok ? { version: String(json.data?.version || "?") } : null;
  } catch {
    return null;
  }
}

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
