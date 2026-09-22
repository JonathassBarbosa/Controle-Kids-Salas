// Configuração de implantação carregada em tempo de execução (não em build).
// O administrador edita public/config.json (vira ./config.json no site publicado)
// para apontar a URL /exec do Apps Script, sem precisar recompilar o frontend.
export type AppConfig = { apiUrl: string };

let cached: Promise<AppConfig> | null = null;

function normalize(data: unknown): AppConfig {
  const apiUrl = data && typeof data === "object" && typeof (data as Record<string, unknown>).apiUrl === "string"
    ? String((data as Record<string, unknown>).apiUrl).trim()
    : "";
  return { apiUrl };
}

export function loadConfig(): Promise<AppConfig> {
  if (!cached) {
    cached = fetch("./config.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}))
      .then(normalize);
  }
  return cached;
}

// Permite forçar releitura (ex.: tela de configuração do administrador local).
export function reloadConfig(): Promise<AppConfig> {
  cached = null;
  return loadConfig();
}
