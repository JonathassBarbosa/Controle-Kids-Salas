"use client";
// Painel por sala (Kids-In): tudo calculado no navegador a partir dos
// registros que a gestão já carrega (records.list) — nenhuma chamada nova ao
// servidor e nenhuma mudança nas métricas existentes.
import { useMemo } from "react";
import { ChevronRight, HeartHandshake, House, Star, TriangleAlert } from "lucide-react";
import type { ApiRecord, ApiRoom } from "./api";
import { ages, formatDateBR, shifts } from "./model";

const SHIFT_COLORS: Record<string, string> = { Manhã: "var(--t1)", Tarde: "var(--t2)", Noite: "var(--t3)" };
const ROOM_TILES = ["t-or", "t-bl", "t-gr", "t-lv", "t-rd", "t-yl"];
const AVATAR_COLORS = [
  ["#FFE1EF", "#C2416B"],
  ["#E3EFFF", "#2563C9"],
  ["#DDF6EC", "#16865A"],
  ["#FFEEDD", "#C25E00"],
  ["#EFE8FF", "#6A4BD6"],
];

const hasCare = (r: ApiRecord) => r.tea || r.disability || r.foodRestriction;
function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}
function datesBetween(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function rankBy(records: ApiRecord[], nameFor: (uid: string, serverName?: string) => string) {
  const counts = new Map<string, { uid: string; name: string; count: number }>();
  records.forEach((r) => {
    const cur = counts.get(r.createdBy) || { uid: r.createdBy, name: nameFor(r.createdBy, r.createdByName), count: 0 };
    cur.count += 1;
    counts.set(r.createdBy, cur);
  });
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function Avatar({ name, i = 0, size = 36 }: { name: string; i?: number; size?: number }) {
  const [bg, fg] = AVATAR_COLORS[i % AVATAR_COLORS.length];
  return (
    <span className="initials-avatar" style={{ width: size, height: size, background: bg, color: fg }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="spark-empty" />;
  const w = 240;
  const h = 48;
  const max = Math.max(1, ...values);
  const X = (i: number) => 3 + (i * (w - 6)) / (values.length - 1);
  const Y = (v: number) => h - 4 - (v / max) * (h - 10);
  const pts = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`${X(0)},${h} ${pts} ${X(values.length - 1)},${h}`} fill="var(--y)" opacity=".28" />
      <polyline points={pts} fill="none" stroke="var(--y-deep)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Visão geral: um cartão por sala. Clicar abre o painel daquela sala. */
export function RoomOverview({
  rooms,
  records,
  from,
  to,
  nameFor,
  onOpen,
}: {
  rooms: ApiRoom[];
  records: ApiRecord[];
  from: string;
  to: string;
  nameFor: (uid: string, serverName?: string) => string;
  onOpen: (roomId: string) => void;
}) {
  const days = useMemo(() => datesBetween(from, to), [from, to]);
  const cards = useMemo(() => {
    const list = rooms
      .map((room, idx) => {
        const rs = records.filter((r) => r.roomId === room.id);
        const perDay = days.map((d) => rs.filter((r) => r.date === d).length);
        const busiestShift = shifts.map((s) => [s, rs.filter((r) => r.shift === s).length] as const).sort((a, b) => b[1] - a[1])[0];
        return { room, idx, total: rs.length, care: rs.filter(hasCare).length, top: rankBy(rs, nameFor)[0], perDay, busiestShift };
      })
      .filter((c) => c.room.active || c.total > 0);
    return list;
  }, [rooms, records, days, nameFor]);
  const max = Math.max(1, ...cards.map((c) => c.total));

  if (!cards.length) return null;
  return (
    <section className="room-overview" aria-label="Resumo por sala">
      <div className="section-title">
        <h2>Resumo por sala</h2>
        <span>Toque numa sala para ver os detalhes dela</span>
      </div>
      <div className="room-cards">
        {cards.map(({ room, idx, total, care, top, perDay, busiestShift }) => (
          <button key={room.id} type="button" className="room-card" onClick={() => onOpen(room.id)}>
            <div className="rc-head">
              <span className={`tile ${ROOM_TILES[idx % ROOM_TILES.length]}`}>
                <House size={18} />
              </span>
              <span className="rc-name">
                <b>{room.name}</b>
                <small>{room.active ? `Mais cheio: ${busiestShift && busiestShift[1] > 0 ? busiestShift[0] : "—"}` : "Sala inativa"}</small>
              </span>
              {care > 0 && (
                <span className="pill care">
                  <HeartHandshake size={13} />
                  {care} com cuidados
                </span>
              )}
            </div>
            <div className="rc-mid">
              <div className="rc-big">
                {total}
                <small>{total === 1 ? "criança" : "crianças"}</small>
              </div>
              <Spark values={perDay} />
            </div>
            <div className="rc-share" aria-label={`${Math.round((100 * total) / max)}% da sala com mais atendimentos`}>
              <i style={{ width: `${(100 * total) / max}%` }} />
            </div>
            <div className="rc-foot">
              {top ? (
                <>
                  <Avatar name={top.name} i={idx} size={30} />
                  <span>
                    Destaque: <b>{top.name.split(" ")[0]}</b> · {top.count}
                  </span>
                </>
              ) : (
                <span>Nenhum check-in no período</span>
              )}
              <span className="go">
                Abrir <ChevronRight size={15} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Painel de uma sala: crianças por dia e turno + ranking da sala. */
export function RoomDetail({
  records,
  from,
  to,
  nameFor,
}: {
  records: ApiRecord[];
  from: string;
  to: string;
  nameFor: (uid: string, serverName?: string) => string;
}) {
  const allDays = useMemo(() => datesBetween(from, to), [from, to]);
  const days = allDays.slice(-31);
  const perDay = days.map((d) => {
    const rs = records.filter((r) => r.date === d);
    return { d, total: rs.length, byShift: shifts.map((s) => rs.filter((r) => r.shift === s).length) };
  });
  const max = Math.max(1, ...perDay.map((p) => p.total));
  const ranking = useMemo(() => rankBy(records, nameFor), [records, nameFor]);
  const rmax = ranking[0]?.count || 1;
  const every = Math.ceil(days.length / 7);
  const busiestAge = ages.map((a) => [a, records.filter((r) => r.age === a).length] as const).sort((a, b) => b[1] - a[1])[0];
  const noSnack = records.filter((r) => !r.snackOk).length;

  return (
    <div className="room-detail">
      <article className="panel chart-panel">
        <div className="panel-head">
          <h2>Crianças por dia e turno</h2>
          {allDays.length > days.length && <span>Últimos 31 dias do período</span>}
        </div>
        <div className="legend">
          {shifts.map((s) => (
            <span key={s}>
              <i style={{ background: SHIFT_COLORS[s] }} />
              {s}
            </span>
          ))}
        </div>
        <div className="stack-chart" role="img" aria-label="Crianças por dia, separadas por turno">
          <div className="stack-grid">
            {[1, 0.5, 0].map((f) => (
              <span key={f} style={{ bottom: `${f * 100}%` }}>
                {Math.round(max * f)}
              </span>
            ))}
          </div>
          <div className="stack-bars">
            {perDay.map((p, i) => (
              <div className="stack-col" key={p.d} title={`${formatDateBR(p.d)} · ${shifts.map((s, j) => `${s}: ${p.byShift[j]}`).join(" · ")} · Total: ${p.total}`}>
                <div className="stack" style={{ height: `${(100 * p.total) / max}%` }}>
                  {p.byShift.map((n, j) =>
                    n ? <i key={j} style={{ flexGrow: n, background: SHIFT_COLORS[shifts[j]] }} /> : null
                  )}
                </div>
                <small>{(days.length - 1 - i) % every === 0 ? formatDateBR(p.d).slice(0, 5) : ""}</small>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <h2>Ranking da sala</h2>
          <span>Check-ins por recreadora</span>
        </div>
        {ranking.length === 0 ? (
          <p className="data-note">Nenhum check-in nesta sala no período.</p>
        ) : (
          <ol className="room-rank">
            {ranking.slice(0, 8).map((r, i) => (
              <li key={r.uid} className={i === 0 ? "first" : ""}>
                <span className="pos">{i === 0 ? <Star size={16} fill="currentColor" /> : i + 1}</span>
                <Avatar name={r.name} i={i} />
                <span className="nm">
                  {r.name}
                  <span className="tr">
                    <i style={{ width: `${(100 * r.count) / rmax}%` }} />
                  </span>
                </span>
                <b>{r.count}</b>
              </li>
            ))}
          </ol>
        )}
        <div className="room-facts">
          {busiestAge && busiestAge[1] > 0 && (
            <span>
              Faixa mais comum: <b>{busiestAge[0]} anos</b>
            </span>
          )}
          {noSnack > 0 && (
            <span>
              <TriangleAlert size={14} /> {noSnack} sem lanche liberado
            </span>
          )}
        </div>
      </article>
    </div>
  );
}
