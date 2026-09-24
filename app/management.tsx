"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import * as api from "./api";
import { ApiError, type ApiRecord, type ApiRoom, type ApiUser, type Role } from "./api";
import { ages, careSummary, daysAgo, formatDateBR, genders, roomName, shifts, today } from "./model";
import { exportPng, exportXlsx } from "./exports";
import { Choice } from "./choice";
import Stock from "./stock";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ROLE_LABELS: Record<Role, string> = { operador: "Operador(a)", gestor: "Gestor(a) de sala", admin: "Administrador(a)" };
// PNG usa <canvas>; navegadores começam a recusar telas gigantes por volta de
// 16000px de altura. Resumimos em vez de estourar silenciosamente.
const PNG_ROW_LIMIT = 250;

function short(uid: string) {
  return uid.slice(0, 8);
}

export default function Management({
  user,
  idToken,
  rooms,
  onRoomsChanged,
  onEdit,
  onAuthExpired,
}: {
  user: ApiUser;
  idToken: string;
  rooms: ApiRoom[];
  onRoomsChanged: () => void;
  onEdit: (record: ApiRecord) => void;
  onAuthExpired: (message?: string) => void;
}) {
  const isAdmin = user.role === "admin";
  const isGestor = user.role === "gestor";
  // Operador(a) só usa esta tela para o estoque diário — sem dashboard,
  // histórico de crianças ou gestão de usuários/salas (pedido do cliente em
  // 24/09/2026: reduzir o que o operador vê aqui a "apenas o estoque").
  const isOperadorOnly = user.role === "operador";
  const myRooms = useMemo(() => rooms.filter((r) => isAdmin || user.roomIds.includes(r.id)), [rooms, user, isAdmin]);
  const editableWithoutLimit = isAdmin;

  const [tab, setTab] = useState(() => (isOperadorOnly ? "Estoque" : "Dashboard"));
  const [start, setStart] = useState(daysAgo(30));
  const [end, setEnd] = useState(today());
  const [roomFilter, setRoomFilter] = useState("");
  const [shift, setShift] = useState("Todos");
  const [age, setAge] = useState("Todos");
  const [gender, setGender] = useState("Todos");
  const [teaFilter, setTeaFilter] = useState("Todos");
  const [records, setRecords] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [audit, setAudit] = useState<{ record: ApiRecord; history: ApiRecord[] | null; loading: boolean; error: string } | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

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

  const loadRecords = useCallback(async () => {
    if (isOperadorOnly || start > end) return;
    setLoading(true);
    setLoadError("");
    try {
      const { records: all } = await api.listAllRecords(idToken, {
        from: start,
        to: end,
        roomId: roomFilter || undefined,
        shift: shift === "Todos" ? undefined : shift,
        age: age === "Todos" ? undefined : age,
        gender: gender === "Todos" ? undefined : gender,
        tea: teaFilter === "Todos" ? undefined : teaFilter === "Sim",
      });
      setRecords(all);
    } catch (err) {
      if (authGuard(err)) return;
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar os registros agora.");
    } finally {
      setLoading(false);
    }
  }, [idToken, start, end, roomFilter, shift, age, gender, teaFilter, authGuard, isOperadorOnly]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Nomes dos autores só existem para o administrador (admin.users). Para
  // gestor/operador mostramos "Você" no próprio registro e um identificador
  // curto nos demais — a API não devolve nome de autor para esses papéis.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .adminUsers(idToken)
      .then((list) => setUserNames(Object.fromEntries(list.map((u) => [u.uid, u.name]))))
      .catch(() => {});
  }, [isAdmin, idToken]);

  function authorLabel(uid: string) {
    if (uid === user.uid) return "Você";
    if (userNames[uid]) return userNames[uid];
    return "Colaborador " + short(uid);
  }

  // Sala/turno/idade/gênero/TEA já são filtrados pelo servidor (records.list);
  // "records" aqui já chega filtrado — o alias abaixo evita renomear tudo.
  const filtered = records;
  const totalChildren = filtered.length;
  const teaCount = filtered.filter((r) => r.tea).length;
  const disabilityCount = filtered.filter((r) => r.disability).length;
  const foodRestrictionCount = filtered.filter((r) => r.foodRestriction).length;
  const roomLabel = roomFilter ? roomName(rooms, roomFilter) : isAdmin ? "Todas as salas" : "Todas as minhas salas";
  const filtersText = `Período: ${start} a ${end}; Sala: ${roomLabel}; Turno: ${shift}; Idade: ${age}; Gênero: ${gender}; TEA: ${teaFilter}`;

  async function openHistory(record: ApiRecord) {
    setAudit({ record, history: null, loading: true, error: "" });
    try {
      const history = await api.recordHistory(idToken, record.id);
      setAudit({ record, history: history.slice().sort((a, b) => a.version - b.version), loading: false, error: "" });
    } catch (err) {
      if (authGuard(err)) return;
      setAudit({ record, history: null, loading: false, error: err instanceof ApiError ? err.message : "Não foi possível carregar o histórico." });
    }
  }

  function canCorrect(record: ApiRecord) {
    return editableWithoutLimit || record.date >= daysAgo(7);
  }

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          {["Criança", "Sala", "Data / turno", "Idade", "Gênero", "Cuidados", "Responsável", "Ações"].map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.childName}</TableCell>
            <TableCell>{roomName(rooms, r.roomId)}</TableCell>
            <TableCell>
              {formatDateBR(r.date)} · {r.shift}
            </TableCell>
            <TableCell>{r.age}</TableCell>
            <TableCell>{r.gender}</TableCell>
            <TableCell>{careSummary(r, false).join(", ") || "—"}</TableCell>
            <TableCell>{authorLabel(r.updatedBy)}</TableCell>
            <TableCell>
              <button className="link-button" disabled={!canCorrect(r)} onClick={() => onEdit(r)}>
                Corrigir
              </button>
              <button className="link-button" onClick={() => openHistory(r)}>
                Histórico
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const tabs = isOperadorOnly ? ["Estoque"] : ["Dashboard", "Estoque", ...(isAdmin || isGestor ? ["Usuários"] : []), ...(isAdmin ? ["Salas", "Sistema"] : [])];

  return (
    <section className={isOperadorOnly ? "management management-simple" : "management"}>
      <header className="management-heading">
        <div>
          <p className="eyebrow">{isOperadorOnly ? "GAV KIDS · ESTOQUE" : "GAV KIDS · GESTÃO"}</p>
          <h1>{isOperadorOnly ? "Estoque da sua sala" : "Visão da operação"}</h1>
          <p>{isOperadorOnly ? "Registre a saída de hoje dos insumos da sua sala." : `Atendimentos dos espaços kids${!isAdmin ? " — salas vinculadas ao seu usuário" : ""}`}</p>
        </div>
        <img src="./gav-logo-blue.png" alt="GAV" />
      </header>

      {tabs.length > 1 && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="management-tabs" aria-label="Área de gestão">
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {tab === "Dashboard" && (
        <>
          <div className="filters">
            <label className="field">
              De
              <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              Até
              <input type="date" value={end} min={start} max={today()} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <Choice
              label="Sala"
              value={roomFilter}
              onChange={setRoomFilter}
              options={["", ...myRooms.map((r) => r.id)]}
              optionLabels={{ "": isAdmin ? "Todas" : "Todas as minhas salas", ...Object.fromEntries(myRooms.map((r) => [r.id, r.name])) }}
            />
            <Choice label="Turno" value={shift} onChange={setShift} options={["Todos", ...shifts]} />
            <Choice label="Faixa etária" value={age} onChange={setAge} options={["Todos", ...ages]} />
            <Choice label="Gênero" value={gender} onChange={setGender} options={["Todos", ...genders]} />
            <Choice label="TEA" value={teaFilter} onChange={setTeaFilter} options={["Todos", "Sim", "Não"]} />
          </div>

          {loading && (
            <p className="data-note">
              <Loader2 size={16} className="spin" style={{ verticalAlign: "middle", marginRight: 8 }} />
              Carregando registros do servidor…
            </p>
          )}
          {loadError && (
            <p className="error-message" role="alert">
              {loadError}{" "}
              <button className="link-button" onClick={loadRecords}>
                Tentar novamente
              </button>
            </p>
          )}

          {start > end ? (
            <p role="alert">A data inicial deve ser anterior à final.</p>
          ) : !loading && !loadError ? (
            <>
              <div className="metrics">
                {[
                  ["Crianças atendidas", totalChildren],
                  ["Com TEA", teaCount],
                  ["Com deficiência física", disabilityCount],
                  ["Com restrição alimentar", foodRestrictionCount],
                ].map(([l, v]) => (
                  <article key={String(l)}>
                    <span>{String(l)}</span>
                    <strong>{v}</strong>
                  </article>
                ))}
              </div>
              <p className="data-note">
                Cada registro é o check-in de uma criança, feito pela recreadora em tempo real assim que ela chega. Sala, turno, faixa etária, gênero e TEA já
                aplicados pelos filtros acima. Os números não representam lotação simultânea — não há registro de saída.
              </p>
              <div className="charts">
                {[
                  ["Por faixa etária", ages.map((a) => [a, filtered.filter((r) => r.age === a).length] as [string, number])],
                  ["Por gênero", genders.map((g) => [g, filtered.filter((r) => r.gender === g).length] as [string, number])],
                  ["Evolução diária", [...new Set(filtered.map((r) => r.date))].sort().map((d) => [d, filtered.filter((r) => r.date === d).length] as [string, number])],
                ].map(([title, data]) => (
                  <article key={String(title)}>
                    <h2>{String(title)}</h2>
                    {(data as [string, number][]).map(([label, n]) => (
                      <div className="bar-row" key={label}>
                        <span>{label}</span>
                        <div>
                          <i style={{ width: `${(100 * n) / Math.max(1, ...(data as [string, number][]).map((d) => d[1]))}%` }} />
                        </div>
                        <b>{n}</b>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
              <div className="export-actions">
                <h2>Registros do período</h2>
                <button onClick={() => exportXlsx(filtered, rooms, filtersText)}>Baixar XLSX</button>
                <button onClick={() => window.print()}>Salvar em PDF</button>
                <button
                  onClick={() => {
                    if (filtered.length > PNG_ROW_LIMIT && !confirm(`O período tem ${filtered.length} registros. O PNG mostrará só os primeiros ${PNG_ROW_LIMIT}. Use o XLSX para o total completo. Continuar?`)) return;
                    exportPng(filtered.slice(0, PNG_ROW_LIMIT), rooms, filtersText);
                  }}
                >
                  Baixar PNG
                </button>
              </div>
              <p className="print-filters">{filtersText}</p>
              {filtered.length ? table : <p className="empty-message">Nenhum registro neste período e sala. Ajuste os filtros ou registre um turno.</p>}
            </>
          ) : null}
        </>
      )}

      {tab === "Estoque" && <Stock user={user} idToken={idToken} rooms={rooms} onAuthExpired={onAuthExpired} />}
      {tab === "Usuários" && (isAdmin || isGestor) && <UsersPanel idToken={idToken} rooms={rooms} actor={user} onAuthExpired={onAuthExpired} />}
      {tab === "Salas" && isAdmin && <RoomsPanel idToken={idToken} rooms={rooms} onChanged={onRoomsChanged} onAuthExpired={onAuthExpired} />}
      {tab === "Sistema" && isAdmin && <SystemPanel />}

      <Dialog open={!!audit} onOpenChange={(o) => !o && setAudit(null)}>
        <DialogContent>
          <DialogTitle>Histórico de alterações</DialogTitle>
          <DialogDescription>
            {audit && `${audit.record.childName} · ${roomName(rooms, audit.record.roomId)} · ${formatDateBR(audit.record.date)} · ${audit.record.shift}`}
          </DialogDescription>
          {audit?.loading && <p>Carregando…</p>}
          {audit?.error && (
            <p className="error-message" role="alert">
              {audit.error}
            </p>
          )}
          {audit?.history &&
            audit.history.map((h) => (
              <p key={h.version}>
                {h.version === 1 ? "Criado" : `Corrigido (versão ${h.version})`} em {new Date(h.updatedAt).toLocaleString("pt-BR")} por {authorLabel(h.updatedBy)}.
                <br />
                {h.childName} · {h.age} · {h.gender}
                {careSummary(h).length ? " — " + careSummary(h).join("; ") : ""}
                {h.notes ? ` · Observação: ${h.notes}` : ""}
              </p>
            ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function UsersPanel({
  idToken,
  rooms,
  actor,
  onAuthExpired,
}: {
  idToken: string;
  rooms: ApiRoom[];
  actor: ApiUser;
  onAuthExpired: (message?: string) => void;
}) {
  const isAdmin = actor.role === "admin";
  // Gestor(a) só pode escolher, ver e vincular as próprias salas — o
  // servidor aplica a mesma restrição de verdade em admin.saveUser.
  const selectableRooms = isAdmin ? rooms.filter((r) => r.active) : rooms.filter((r) => r.active && actor.roomIds.includes(r.id));
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Partial<ApiUser> & { password?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setUsers(await api.adminUsers(idToken));
    } catch (err) {
      if (authGuard(err)) return;
      setLoadError(err instanceof ApiError ? err.message : "Não foi possível carregar os usuários.");
    }
  }, [idToken, authGuard]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleRoom(id: string) {
    if (!editing) return;
    const roomIds = editing.roomIds || [];
    setEditing({ ...editing, roomIds: roomIds.includes(id) ? roomIds.filter((r) => r !== id) : [...roomIds, id] });
  }

  async function save() {
    if (!editing) return;
    const name = (editing.name || "").trim();
    const username = (editing.username || "").trim().toLowerCase();
    const email = (editing.email || "").trim().toLowerCase();
    if (!name || !/^[a-z0-9._-]{3,60}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Confira nome, usuário (letras minúsculas/números/. _ -) e e-mail.");
      return;
    }
    const role = (isAdmin ? editing.role : "operador") as Role | undefined;
    if (!role) {
      setError("Selecione o perfil.");
      return;
    }
    const roomIds = editing.roomIds || [];
    if (role !== "admin" && roomIds.length === 0) {
      setError("Vincule pelo menos uma sala.");
      return;
    }
    if (!editing.uid && (!editing.password || editing.password.length < 12)) {
      setError("Defina uma senha de pelo menos 12 caracteres para o novo usuário.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.adminSaveUser(idToken, {
        uid: editing.uid,
        username,
        name,
        email,
        role,
        roomIds,
        active: editing.active ?? true,
        password: editing.password || undefined,
      });
      setEditing(null);
      await load();
    } catch (err) {
      if (authGuard(err)) return;
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: ApiUser) {
    try {
      await api.adminSaveUser(idToken, { uid: u.uid, username: u.username, name: u.name, email: u.email, role: u.role, roomIds: u.roomIds, active: !u.active });
      await load();
    } catch (err) {
      if (authGuard(err)) return;
      alert(err instanceof ApiError ? err.message : "Não foi possível atualizar o usuário.");
    }
  }

  return (
    <>
      <div className="export-actions">
        <h2>{isAdmin ? "Usuários" : "Recreadoras das minhas salas"}</h2>
        <button onClick={() => { setError(""); setEditing({ role: "operador", roomIds: isAdmin ? [] : [...actor.roomIds], active: true }); }}>
          {isAdmin ? "Novo usuário" : "Nova recreadora"}
        </button>
      </div>
      {!isAdmin && (
        <p className="data-note">
          Como gestor(a) de sala, você só cadastra e edita recreadoras (perfil operador) vinculadas às suas próprias salas.
        </p>
      )}
      {loadError && (
        <p className="error-message" role="alert">
          {loadError}{" "}
          <button className="link-button" onClick={load}>
            Tentar novamente
          </button>
        </p>
      )}
      {users && (
        <Table>
          <TableHeader>
            <TableRow>
              {["Nome", "Usuário", "E-mail", "Perfil", "Salas", "Status", ""].map((h, i) => (
                <TableHead key={i}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.uid}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.username}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>{u.role === "admin" ? "Todas" : u.roomIds.map((id) => roomName(rooms, id)).join(", ") || "—"}</TableCell>
                <TableCell>{u.active ? "Ativo" : "Bloqueado"}</TableCell>
                <TableCell>
                  <button className="link-button" onClick={() => setEditing({ ...u })}>
                    Editar
                  </button>
                  <button className="link-button" disabled={u.uid === actor.uid} onClick={() => toggleActive(u)}>
                    {u.active ? "Bloquear" : "Ativar"}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>{editing?.uid ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription>{editing?.uid ? "Alterações valem imediatamente; senha em branco mantém a atual." : "O usuário poderá entrar assim que salvo."}</DialogDescription>
          {editing && (
            <>
              <label className="field">
                Nome
                <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </label>
              <label className="field">
                Usuário (login)
                <input value={editing.username || ""} onChange={(e) => setEditing({ ...editing, username: e.target.value })} autoCapitalize="off" />
              </label>
              <label className="field">
                E-mail
                <input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </label>
              <label className="field">
                {editing.uid ? "Nova senha (deixe em branco para manter a atual)" : "Senha (mínimo 12 caracteres)"}
                <input type="password" value={editing.password || ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} autoComplete="new-password" />
              </label>
              {isAdmin ? (
                <Choice label="Perfil" value={editing.role || "operador"} onChange={(v) => setEditing({ ...editing, role: v as Role })} options={["operador", "gestor", "admin"]} optionLabels={ROLE_LABELS} />
              ) : (
                <p className="data-note" style={{ margin: 0 }}>
                  Perfil: {ROLE_LABELS.operador} (gestores só cadastram recreadoras).
                </p>
              )}
              {editing.role !== "admin" && (
                <fieldset className="field">
                  <legend>Salas vinculadas</legend>
                  <div className="room-checklist">
                    {selectableRooms.map((r) => (
                      <label key={r.id}>
                        <input type="checkbox" checked={(editing.roomIds || []).includes(r.id)} onChange={() => toggleRoom(r.id)} />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} style={{ width: "auto" }} />
                Usuário ativo
              </label>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <button className="action-button" disabled={saving} onClick={save}>
                {saving ? "Salvando…" : "Salvar usuário"}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoomsPanel({ idToken, rooms, onChanged, onAuthExpired }: { idToken: string; rooms: ApiRoom[]; onChanged: () => void; onAuthExpired: (message?: string) => void }) {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function authGuard(err: unknown) {
    if (err instanceof ApiError && err.code === "AUTH") {
      onAuthExpired("Sua sessão expirou. Entre novamente.");
      return true;
    }
    return false;
  }

  async function addRoom() {
    if (!name.trim()) {
      setError("Informe o nome da sala.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.adminSaveRoom(idToken, { name: name.trim(), active: true });
      setName("");
      onChanged();
    } catch (err) {
      if (authGuard(err)) return;
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a sala.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRoom(r: ApiRoom) {
    try {
      await api.adminSaveRoom(idToken, { id: r.id, name: r.name, active: !r.active });
      onChanged();
    } catch (err) {
      if (authGuard(err)) return;
      alert(err instanceof ApiError ? err.message : "Não foi possível atualizar a sala.");
    }
  }

  return (
    <>
      <h2>{rooms.filter((r) => r.active).length} salas ativas</h2>
      <div className="filters">
        <label className="field">
          Buscar sala
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          Nome da nova sala
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button disabled={busy} onClick={addRoom}>
          Adicionar sala
        </button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="room-list">
        {rooms
          .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
          .map((r) => (
            <article key={r.id}>
              <strong>{r.name}</strong>
              <span>{r.active ? "Ativa" : "Inativa"}</span>
              <button onClick={() => toggleRoom(r)}>{r.active ? "Desativar" : "Ativar"}</button>
            </article>
          ))}
      </div>
      <p>Desativar preserva os registros históricos da sala. Vendas Digitais não faz parte do cadastro inicial.</p>
    </>
  );
}

function SystemPanel() {
  const [status, setStatus] = useState<{ ok: boolean; version?: string } | "loading">("loading");
  useEffect(() => {
    api.ping().then((r) => setStatus(r ? { ok: true, version: r.version } : { ok: false }));
  }, []);
  return (
    <div className="integration-list">
      <article>
        <h2>Conexão com o Apps Script</h2>
        {status === "loading" && <p>Verificando…</p>}
        {status !== "loading" && status.ok && <p>Backend respondendo. Versão relatada: {status.version}.</p>}
        {status !== "loading" && !status.ok && <p>Não foi possível confirmar a URL configurada em config.json. Verifique a implantação do Apps Script.</p>}
      </article>
      <article>
        <h2>Limitações conhecidas desta versão</h2>
        <p>
          O nome de quem registrou um atendimento só é exibido para o administrador (a API devolve apenas o identificador do usuário para gestor e operador). Sessões
          expiradas não têm limpeza automática na planilha. A exportação PNG resume históricos muito grandes; use XLSX para o total completo.
        </p>
      </article>
    </div>
  );
}
