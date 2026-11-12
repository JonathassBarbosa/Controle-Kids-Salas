"use client";
// Kids-In: personagens (parceiros de turno), logo, abertura animada e confete.
// A escolha do parceiro é uma preferência visual guardada só neste aparelho
// (localStorage, por usuário) — não vai para o servidor nem muda nenhum dado.
import { useEffect, useState, useSyncExternalStore } from "react";

export type BuddyKind = "mel" | "lumi" | "nuvem";
export type Pose = "idle" | "wave" | "curious" | "sleep";

export const BUDDIES: Record<BuddyKind, { name: string; bio: string; bg: string }> = {
  mel: { name: "Mel", bio: "Fofinha e animada. Comemora cada criança que chega.", bg: "#FFF1C9" },
  lumi: { name: "Lumi", bio: "Curiosa e antenada. Percebe tudo o que acontece no turno.", bg: "#EEE6FF" },
  nuvem: { name: "Nuvem", bio: "Calma e fofinha. Adora a hora do soninho.", bg: "#E1F0FF" },
};
const KINDS = Object.keys(BUDDIES) as BuddyKind[];
const EVENT = "kidsin-buddy";
const key = (uid?: string) => `kidsin-buddy:${uid || "last"}`;

function readBuddy(uid?: string): BuddyKind {
  try {
    const v = localStorage.getItem(key(uid)) || localStorage.getItem(key());
    if (v && KINDS.includes(v as BuddyKind)) return v as BuddyKind;
  } catch {
    // armazenamento bloqueado: usa o padrão
  }
  return "mel";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useBuddy(uid?: string): [BuddyKind, (k: BuddyKind) => void] {
  const kind = useSyncExternalStore(subscribe, () => readBuddy(uid), () => "mel" as BuddyKind);
  function choose(k: BuddyKind) {
    try {
      localStorage.setItem(key(uid), k);
      localStorage.setItem(key(), k);
    } catch {
      // sem armazenamento: vale só até recarregar
    }
    window.dispatchEvent(new Event(EVENT));
  }
  return [kind, choose];
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Personagem com pose. Mude `jump` (ex.: um contador) para ele dar um pulinho. */
export function Buddy({ kind, pose = "idle", jump, className = "", label }: { kind: BuddyKind; pose?: Pose; jump?: number; className?: string; label?: string }) {
  // Pula quando `jump` muda; o pulo termina sozinho no fim da animação.
  const [jumpedAt, setJumpedAt] = useState(jump);
  const jumping = jump !== undefined && jump !== jumpedAt;
  return (
    <span className={`buddy pose-${pose}${jumping ? " jump" : ""} ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <img src={`./kids/${kind}-${pose}.webp`} alt="" draggable={false} onAnimationEnd={() => jumping && setJumpedAt(jump)} />
      <span className="zz" aria-hidden="true">
        <span>z</span>
        <span>z</span>
      </span>
    </span>
  );
}

export function BuddyAvatar({ kind, size = 40 }: { kind: BuddyKind; size?: number }) {
  return (
    <span className="buddy-avatar" style={{ width: size, height: size, background: BUDDIES[kind].bg }} aria-hidden="true">
      <img src={`./kids/${kind}-idle.webp`} alt="" />
    </span>
  );
}

export function Wordmark({ mono = false }: { mono?: boolean }) {
  return (
    <span className={mono ? "wm mono" : "wm"} aria-label="Kids-In">
      <b>K</b>
      <b>i</b>
      <b>d</b>
      <b>s</b>
      <i>In</i>
    </span>
  );
}

export function Lockup({ mono = false, className = "" }: { mono?: boolean; className?: string }) {
  return (
    <span className={`lockup ${className}`}>
      <img src="./kids/logo-mark.svg" alt="" />
      <Wordmark mono={mono} />
    </span>
  );
}

/** Abertura: a casinha cai, a porta abre, o parceiro aparece e o nome entra pulando. */
export function Splash({ kind, onDone, tagline = "Recreação com carinho" }: { kind: BuddyKind; onDone?: () => void; tagline?: string }) {
  useEffect(() => {
    if (!onDone) return;
    const t = setTimeout(onDone, reducedMotion() ? 700 : 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="splash" onClick={onDone} role="status" aria-label="Abrindo o Kids-In">
      <div className="sp-stage">
        <div className="sp-char">
          <Buddy kind={kind} pose="wave" />
        </div>
        <div className="sp-house">
          <img src="./kids/logo-mark.svg" alt="" />
          <span className="sp-door" />
        </div>
      </div>
      <div className="sp-word" aria-hidden="true">
        <span>K</span>
        <span>i</span>
        <span>d</span>
        <span>s</span>
        <span className="in">In</span>
      </div>
      <p className="sp-tag">{tagline}</p>
    </div>
  );
}

export function BuddyPicker({ kind, onChoose }: { kind: BuddyKind; onChoose: (k: BuddyKind) => void }) {
  return (
    <div className="buddy-picker" role="radiogroup" aria-label="Escolha seu parceiro">
      {KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={k === kind} className={k === kind ? "on" : ""} onClick={() => onChoose(k)}>
          <span className="ph" style={{ background: BUDDIES[k].bg }}>
            <img src={`./kids/${k}-idle.webp`} alt="" />
          </span>
          <b>{BUDDIES[k].name}</b>
          <small>{BUDDIES[k].bio}</small>
        </button>
      ))}
    </div>
  );
}

const CONFETTI = ["#FF7EB3", "#FFD66B", "#8E6CF0", "#8CCBFF", "#6FDDB3", "#FF8A5B"];
// "Aleatório" determinístico (mesma entrada, mesmo resultado) para a renderização ficar pura.
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
/** Confete que dispara toda vez que `fire` muda (e não é 0). */
export function Confetti({ fire }: { fire: number }) {
  if (!fire) return null;
  return (
    <span className="confetti" aria-hidden="true" key={fire}>
      {Array.from({ length: 36 }, (_, i) => {
        const a = noise(fire * 97 + i) * Math.PI * 2;
        const d = 90 + noise(fire * 31 + i * 7) * 170;
        const style = {
          background: CONFETTI[i % CONFETTI.length],
          ["--x" as string]: `${Math.cos(a) * d}px`,
          ["--y" as string]: `${Math.sin(a) * d - 70}px`,
          ["--r" as string]: `${noise(i + fire) * 720}deg`,
          animationDelay: `${noise(i * 3 + fire) * 0.15}s`,
        } as React.CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}
