import type { ApiRecord, ApiRoom } from "./api";
import { careSummary, roomName } from "./model";

function download(data: Blob, name: string) {
  const u = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const xml = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

function zip(files: Record<string, string>) {
  const enc = new TextEncoder();
  let offset = 0;
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name),
      d = enc.encode(content),
      h = new Uint8Array(30 + n.length),
      v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, crc(d), true);
    v.setUint32(18, d.length, true);
    v.setUint32(22, d.length, true);
    v.setUint16(26, n.length, true);
    h.set(n, 30);
    chunks.push(h, d);
    const c = new Uint8Array(46 + n.length),
      cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc(d), true);
    cv.setUint32(20, d.length, true);
    cv.setUint32(24, d.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    c.set(n, 46);
    central.push(c);
    offset += h.length + d.length;
  }
  const end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, central.length, true);
  v.setUint16(10, central.length, true);
  v.setUint32(12, central.reduce((s, c) => s + c.length, 0), true);
  v.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const YN = (b: boolean) => (b ? "Sim" : "Não");
const BATHROOM_LABEL: Record<string, string> = { pode_levar: "Pode levar", chamar_responsavel: "Chamar responsável" };

// XLSX: uma linha por criança/check-in — não há mais total agregado por
// turno para repetir/somar; cada linha já é um atendimento único.
export function exportXlsx(entries: ApiRecord[], rooms: ApiRoom[], filters: string) {
  const rows: (string | number)[][] = [
    ["GAV Kids — Relatório de atendimentos (check-in por criança)"],
    [filters],
    ["Cada linha é um check-in de uma criança. Não há registro de saída nem cálculo de lotação simultânea."],
    [
      "Sala",
      "Data",
      "Turno",
      "Criança",
      "Faixa etária",
      "Gênero",
      "TEA",
      "Deficiência física",
      "Nota deficiência",
      "Pode oferecer lanche",
      "Nota lanche",
      "Banheiro",
      "Nota banheiro",
      "Restrição alimentar",
      "Nota restrição alimentar",
      "Observação geral",
      "Responsável (uid)",
      "Criado em",
      "Alterado em",
    ],
  ];
  for (const e of entries) {
    rows.push([
      roomName(rooms, e.roomId),
      e.date,
      e.shift,
      e.childName,
      e.age,
      e.gender,
      YN(e.tea),
      YN(e.disability),
      e.disabilityNote,
      YN(e.snackOk),
      e.snackNote,
      BATHROOM_LABEL[e.bathroom] || e.bathroom,
      e.bathroomNote,
      YN(e.foodRestriction),
      e.foodRestrictionNote,
      e.notes,
      e.updatedBy,
      e.createdAt,
      e.updatedAt,
    ]);
  }
  const sheet =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows
      .map(
        (row, i) =>
          '<row r="' +
          (i + 1) +
          '">' +
          row.map((v) => (typeof v === "number" ? "<c><v>" + v + "</v></c>" : '<c t="inlineStr"><is><t xml:space="preserve">' + xml(v) + "</t></is></c>")).join("") +
          "</row>"
      )
      .join("") +
    "</sheetData></worksheet>";
  download(
    zip({
      "[Content_Types].xml":
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      "_rels/.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml":
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Atendimentos" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml": sheet,
    }),
    "gav-kids-atendimentos.xlsx"
  );
}

export function exportPng(entries: ApiRecord[], rooms: ApiRoom[], filters: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1700;
  canvas.height = 460 + entries.length * 42;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#0b306b";
  c.fillRect(0, 0, 1700, 110);
  c.fillStyle = "#fef9e0";
  c.font = "bold 34px Georgia";
  c.fillText("GAV Kids · Relatório de atendimentos", 45, 67);
  c.fillStyle = "#0b306b";
  c.font = "22px Arial";
  const lines = filters.match(/.{1,110}(?:\s|$)/g) || [filters];
  lines.forEach((t, i) => c.fillText(t, 45, 155 + i * 29));
  c.fillText("Crianças atendidas: " + entries.length + "     Com TEA: " + entries.filter((e) => e.tea).length, 45, 245 + (lines.length - 1) * 29);
  c.font = "19px Arial";
  c.fillText("Cada linha é um check-in de uma criança. Não há registro de saída nem lotação simultânea.", 45, 285 + (lines.length - 1) * 29);
  const headerY = 350 + (lines.length - 1) * 29;
  const cols = [45, 320, 580, 780, 850, 950, 1040];
  c.font = "bold 20px Arial";
  ["Criança", "Sala", "Data / turno", "Idade", "Gênero", "TEA", "Cuidados"].forEach((x, i) => c.fillText(x, cols[i] ?? cols[cols.length - 1], headerY));
  c.font = "18px Arial";
  entries.forEach((e, i) => {
    const y = headerY + 47 + i * 42;
    if (i % 2 === 0) {
      c.fillStyle = "#f1f5fa";
      c.fillRect(30, y - 27, 1640, 40);
    }
    c.fillStyle = "#0b306b";
    const flags = careSummary(e, false).join(", ") || "—";
    [e.childName, roomName(rooms, e.roomId), e.date + " / " + e.shift, e.age, e.gender, e.tea ? "Sim" : "Não", flags.length > 70 ? flags.slice(0, 67) + "…" : flags].forEach((x, j) =>
      c.fillText(x, cols[j] ?? cols[cols.length - 1], y)
    );
  });
  canvas.toBlob((b) => b && download(b, "gav-kids-atendimentos.png"));
}
