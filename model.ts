import type { ApiRecord, ApiRoom, Bathroom } from "./api";

// Espelham as constantes do backend (GAV em apps-script/Code.gs). Mantidas aqui
// só para montar o formulário antes de enviar; a validação que vale é a
// do servidor. Usar sempre o travessão curto "–" (U+2013), igual ao backend.
export const ages = ["0–3", "4–6", "7–9", "10–12", "13+"];
export const genders = ["Feminino", "Masculino", "Não informado"];
export const shifts = ["Manhã", "Tarde", "Noite"];
export const bathroomOptions: { value: Bathroom; label: string }[] = [
  { value: "pode_levar", label: "Pode levar ao banheiro" },
  { value: "chamar_responsavel", label: "Precisa chamar o responsável" },
];

// Itens fixos do controle de estoque, na MESMA ordem/ids de GAV_STOCK_ITEMS
// no backend (apps-script/Code.gs) — não reordene. Os rótulos existem só
// aqui, para a interface; a validação de quantidade (inteiro 0–9999) é
// sempre feita de verdade pelo servidor.
export const STOCK_ITEMS: { key: string; label: string }[] = [
  { key: "pipoca", label: "Pipoca" },
  { key: "pirulito", label: "Pirulito" },
  { key: "biscoitoRecheadoOreo", label: "Biscoito recheado Oreo" },
  { key: "bombomSonhoDeValsa", label: "Bombom Sonho de Valsa" },
  { key: "bombomOuroBranco", label: "Bombom Ouro Branco" },
  { key: "lencosUmedecidosPacote", label: "Lenços umedecidos (pacote)" },
  { key: "pomadaNistatina", label: "Pomada Nistatina" },
  { key: "batataRuffles", label: "Batata Ruffles" },
  { key: "papelCrepom", label: "Papel crepom" },
  { key: "emborrachadoComBrilho", label: "Emborrachado com brilho" },
  { key: "emborrachadoSemBrilho", label: "Emborrachado sem brilho" },
  { key: "sacoDeBaloesColoridos", label: "Saco de balões coloridos" },
  { key: "fraldaP", label: "Fralda tamanho P" },
  { key: "fraldaM", label: "Fralda tamanho M" },
  { key: "fraldaG", label: "Fralda tamanho G" },
  { key: "fraldaXG", label: "Fralda tamanho XG" },
];

export function emptyStockQty(): Record<string, number> {
  return Object.fromEntries(STOCK_ITEMS.map((i) => [i.key, 0]));
}

export function stockQtyFromEntry(entry: { qty: Record<string, number> }): Record<string, number> {
  const q = emptyStockQty();
  STOCK_ITEMS.forEach((i) => (q[i.key] = Number(entry.qty[i.key] || 0)));
  return q;
}

// Só para feedback imediato na UI — o servidor sempre valida de verdade.
export function validateStockQty(qty: Record<string, number>) {
  for (const item of STOCK_ITEMS) {
    const v = qty[item.key];
    if (!Number.isInteger(v) || v < 0 || v > 9999) return `Quantidade inválida em "${item.label}" (use um número inteiro de 0 a 9999).`;
  }
  return "";
}

// Assinatura local de conteúdo, só para decidir se um requestId pode ser
// reaproveitado num reenvio (mesmo conteúdo = mesmo requestId, evitando
// duplicar o lançamento). Não precisa bater byte a byte com o fingerprint
// calculado no servidor — só precisa ser estável para o mesmo conteúdo.
export function stockSignature(id: string | null, version: number | null, roomId: string, date: string, qty: Record<string, number>, notes: string) {
  return JSON.stringify([id || "", version || 0, roomId, date, STOCK_ITEMS.map((i) => qty[i.key]), notes.trim()]);
}

export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysAgo(n: number) {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function suggestedShift() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Manhã" : h < 18 ? "Tarde" : "Noite";
}

export function formatDateBR(iso: string) {
  return iso.split("-").reverse().join("/");
}

// Minutos desde um timestamp ISO (createdAt de um registro), só para decidir
// se mostra os atalhos de "editar rápido" (2h) e "Voltou para a mesa" (3h)
// na lista da própria sala. A regra que vale de verdade é sempre a do
// servidor (7 dias para operador/gestor corrigirem, 3h para operador
// alternar "voltou para a mesa"); isto é só para a interface reagir na hora,
// sem esperar uma tentativa ser recusada.
export function minutesSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function roomName(rooms: ApiRoom[], roomId: string) {
  return rooms.find((r) => r.id === roomId)?.name || roomId;
}

// Resumo curto dos cuidados que fogem do padrão, usado na lista do registro,
// na tabela de gestão e nas exportações. Só lista o que precisa de atenção
// (ex.: não lista "pode oferecer lanche", só "sem lanche liberado").
export function careSummary(
  r: Pick<ApiRecord, "tea" | "disability" | "disabilityNote" | "snackOk" | "snackNote" | "bathroom" | "bathroomNote" | "foodRestriction" | "foodRestrictionNote">,
  withNotes = true
) {
  const flags: string[] = [];
  if (r.tea) flags.push("TEA");
  if (r.disability) flags.push("Deficiência física" + (withNotes && r.disabilityNote ? `: ${r.disabilityNote}` : ""));
  if (!r.snackOk) flags.push("Sem lanche liberado" + (withNotes && r.snackNote ? `: ${r.snackNote}` : ""));
  if (r.bathroom === "chamar_responsavel") flags.push("Chamar responsável no banheiro" + (withNotes && r.bathroomNote ? `: ${r.bathroomNote}` : ""));
  if (r.foodRestriction) flags.push("Restrição alimentar" + (withNotes && r.foodRestrictionNote ? `: ${r.foodRestrictionNote}` : ""));
  return flags;
}

// Rascunho de um check-in de criança, no formato usado pelo formulário antes
// de virar SaveRecordInput. Espelha exatamente os campos exigidos por
// childFields_/saveRecord_ no backend, para que a validação local nunca fique
// mais permissiva do que a do servidor (o servidor sempre decide de verdade).
export interface EntryDraft {
  id: string | null;
  version: number | null;
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
  bathroom: Bathroom | "";
  bathroomNote: string;
  foodRestriction: boolean;
  foodRestrictionNote: string;
  notes: string;
}

export function emptyDraft(roomId = "", date = today(), shift = suggestedShift()): EntryDraft {
  return {
    id: null,
    version: null,
    roomId,
    date,
    shift,
    childName: "",
    age: "",
    gender: "",
    tea: false,
    disability: false,
    disabilityNote: "",
    snackOk: false,
    snackNote: "",
    bathroom: "",
    bathroomNote: "",
    foodRestriction: false,
    foodRestrictionNote: "",
    notes: "",
  };
}

// Limite local só para feedback imediato na UI (o servidor decide de verdade:
// operador/gestor até 7 dias, admin sem limite para datas passadas).
export function validateEntryDraft(e: EntryDraft, allowPastLimit: number | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date > today()) return "Escolha uma data válida, sem ultrapassar hoje.";
  if (allowPastLimit != null && e.date < daysAgo(allowPastLimit)) return `Escolha uma data entre hoje e os últimos ${allowPastLimit} dias.`;
  if (!e.roomId) return "Selecione a sala.";
  if (!shifts.includes(e.shift)) return "Selecione o turno.";
  if (!e.childName.trim()) return "Informe o nome da criança.";
  if (e.childName.trim().length > 150) return "Nome da criança muito longo (máximo 150 caracteres).";
  if (!ages.includes(e.age)) return "Selecione a faixa etária da criança.";
  if (!genders.includes(e.gender)) return "Selecione o gênero da criança.";
  if (e.bathroom !== "pode_levar" && e.bathroom !== "chamar_responsavel") return "Informe a orientação de banheiro.";
  for (const [note, label] of [
    [e.disabilityNote, "da deficiência"],
    [e.snackNote, "do lanche"],
    [e.bathroomNote, "do banheiro"],
    [e.foodRestrictionNote, "da restrição alimentar"],
  ] as const) {
    if (note.length > 300) return `Nota ${label} muito longa (máximo 300 caracteres).`;
  }
  if (e.notes.length > 500) return "Observações gerais muito longas (máximo 500 caracteres).";
  return "";
}

// Campos "de criança" no mesmo formato/ordem que childFields_ devolve no
// backend, usados para compor a assinatura de idempotência abaixo.
function childFields(e: EntryDraft) {
  return {
    age: e.age,
    gender: e.gender,
    tea: e.tea,
    disability: e.disability,
    disabilityNote: e.disabilityNote.trim(),
    snackOk: e.snackOk,
    snackNote: e.snackNote.trim(),
    bathroom: e.bathroom,
    bathroomNote: e.bathroomNote.trim(),
    foodRestriction: e.foodRestriction,
    foodRestrictionNote: e.foodRestrictionNote.trim(),
  };
}

// Gera/reaproveita requestId: mesma "assinatura" de conteúdo = mesmo requestId,
// para que reenviar depois de um erro de rede não crie um registro duplicado.
// Precisa bater com o fingerprint calculado no servidor: JSON.stringify([
// id, version, roomId, date, shift, childName, childFields, notes]).
export function draftSignature(e: EntryDraft) {
  return JSON.stringify([e.id || "", e.version || 0, e.roomId, e.date, e.shift, e.childName.trim(), childFields(e), e.notes.trim()]);
}
