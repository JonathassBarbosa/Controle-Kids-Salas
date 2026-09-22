// Guarda a sessão (idToken opaco do backend, NÃO é JWT/Firebase) no localStorage
// do próprio celular do operador. Decisão consciente: como o app fica na tela
// inicial do celular pessoal e é reaberto várias vezes ao dia, sessionStorage
// derrubaria o login a cada vez que o navegador fosse fechado. Em compensação
// nunca guardamos a senha, e o "Sair" e a expiração de 8h limpam tudo.
import type { ApiUser } from "./api";

const KEY = "gavkids.session.v1";

export interface StoredSession {
  idToken: string;
  user: ApiUser;
  expiresAt: number;
}

export function saveSession(s: StoredSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Armazenamento indisponível (modo privado, cota etc.): a sessão só dura a aba atual.
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.idToken !== "string" || !parsed.user) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorar
  }
}
