"use client";
// Faixa de status da conexão + sincronização da fila offline (ver offline.ts).
// Fica no topo da área de trabalho, para qualquer papel; só aparece quando há
// algo a dizer (sem internet, itens aguardando envio, enviando ou com erro).
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { discard, onOutboxChange, outbox, syncOutbox, type OutboxItem } from "./offline";
import { formatDateBR, roomName } from "./model";
import type { ApiRoom } from "./api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export default function SyncBar({
  idToken,
  uid,
  rooms,
  onAuthExpired,
  onReconnect,
}: {
  idToken: string;
  uid: string;
  rooms: ApiRoom[];
  onAuthExpired: (message?: string) => void;
  onReconnect: () => void;
}) {
  const online = useOnline();
  const [items, setItems] = useState<OutboxItem[]>(() => outbox(uid));
  const [syncing, setSyncing] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [open, setOpen] = useState(false);
  const wasOnline = useRef(online);

  useEffect(() => onOutboxChange(() => setItems(outbox(uid))), [uid]);

  const sync = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!outbox(uid).some((i) => i.status === "pending")) {
      setServerDown(false);
      return;
    }
    setSyncing(true);
    try {
      const r = await syncOutbox(idToken, uid);
      setServerDown(r.offline);
      if (r.authNeeded) {
        const n = outbox(uid).filter((i) => i.status === "pending").length;
        onAuthExpired(`Sua sessão expirou. Entre novamente para enviar ${n === 1 ? "o registro guardado" : `os ${n} registros guardados`} neste aparelho.`);
      }
    } finally {
      setSyncing(false);
      setItems(outbox(uid));
    }
  }, [idToken, uid, onAuthExpired]);

  // Sincroniza ao abrir, ao voltar a internet, ao voltar para o app e a cada 30s enquanto houver pendências.
  useEffect(() => {
    sync();
  }, [sync]);
  useEffect(() => {
    if (online && !wasOnline.current) {
      onReconnect();
      sync();
    }
    wasOnline.current = online;
  }, [online, sync, onReconnect]);
  useEffect(() => {
    const vis = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", vis);
    const timer = setInterval(() => {
      if (outbox(uid).some((i) => i.status === "pending")) sync();
    }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      clearInterval(timer);
    };
  }, [sync, uid]);

  const pending = items.filter((i) => i.status === "pending").length;
  const failed = items.filter((i) => i.status === "failed");

  if (online && !serverDown && pending === 0 && failed.length === 0 && !syncing) return null;

  let tone = "sync-bar";
  let text: string;
  if (!online) {
    tone += " offline";
    text = pending
      ? `Sem internet. ${pending === 1 ? "1 registro guardado" : `${pending} registros guardados`} neste aparelho — ${pending === 1 ? "será enviado" : "serão enviados"} sozinho${pending === 1 ? "" : "s"} quando a conexão voltar.`
      : "Sem internet. Você pode continuar registrando crianças e o estoque do dia: tudo fica guardado neste aparelho e é enviado quando a conexão voltar.";
  } else if (syncing) {
    tone += " syncing";
    text = `Enviando ${pending === 1 ? "1 registro guardado" : `${pending} registros guardados`}…`;
  } else if (pending) {
    tone += " offline";
    text = `${pending === 1 ? "1 registro aguardando" : `${pending} registros aguardando`} envio. O servidor não respondeu; tentaremos de novo automaticamente.`;
  } else {
    tone += " failed";
    text = "";
  }

  return (
    <>
      {(text || failed.length > 0) && (
        <div className={tone} role="status">
          {!online ? <CloudOff size={18} /> : syncing ? <Loader2 size={18} className="spin" /> : pending ? <CloudOff size={18} /> : <AlertTriangle size={18} />}
          <span>
            {text}
            {failed.length > 0 && (
              <>
                {text ? " " : ""}
                <strong>
                  {failed.length === 1 ? "1 registro não foi aceito pelo servidor." : `${failed.length} registros não foram aceitos pelo servidor.`}
                </strong>
              </>
            )}
          </span>
          {failed.length > 0 && (
            <button type="button" className="link-button" onClick={() => setOpen(true)}>
              Ver
            </button>
          )}
          {online && pending > 0 && !syncing && (
            <button type="button" className="link-button" onClick={sync}>
              <RefreshCw size={14} /> Enviar agora
            </button>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Registros não aceitos</DialogTitle>
          <DialogDescription>
            Estes itens foram feitos sem internet e o servidor recusou ao receber. Confira o motivo, refaça o registro se for o caso e depois remova o item daqui.
          </DialogDescription>
          <ul className="failed-list">
            {failed.map((i) => (
              <li key={i.requestId}>
                <div>
                  <strong>{i.kind === "record" ? `Check-in: ${i.payload.childName}` : "Estoque do dia"}</strong>
                  <span>
                    {roomName(rooms, i.payload.roomId)} · {formatDateBR(i.payload.date)}
                    {i.kind === "record" ? ` · ${i.payload.shift}` : ""}
                  </span>
                  <em>{i.error}</em>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    discard(i.requestId);
                    if (failed.length <= 1) setOpen(false);
                  }}
                >
                  <Trash2 size={15} /> Remover
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
