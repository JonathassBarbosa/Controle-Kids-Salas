// Configuração de implantação carregada em tempo de execução (não em build).
// O administrador edita public/config.json (vira ./config.json no site publicado)
// para apontar a URL /exec do Apps Script, sem precisar recompilar o frontend.
export type AppConfig = { apiUrl: string };

let cached: Promise<AppConfig> | null = null;
const CONFIG_KEY = "gavkids.apiUrl.v1";

function normalize(data: unknown): AppConfig {
  const apiUrl = data && typeof data === "object" && typeof (data as Record<string, unknown>).apiUrl === "string"
    ? String((data as Record<string, unknown>).apiUrl).trim()
    : "";
  return { apiUrl };
}

export function loadConfig(): Promise<AppConfig> {
  if (!cached) {
    // Sem internet (fetch falhou), usamos a última URL que funcionou neste aparelho.
    cached = fetch("./config.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then(normalize)
      .then((cfg) => {
        try {
          if (cfg.apiUrl) localStorage.setItem(CONFIG_KEY, cfg.apiUrl);
        } catch {
          // armazenamento indisponível
        }
        return cfg;
      })
      .catch(() => {
        let apiUrl = "";
        try {
          apiUrl = localStorage.getItem(CONFIG_KEY) || "";
        } catch {
          // armazenamento indisponível
        }
        return { apiUrl };
      });
  }
  return cached;
}

// Permite forçar releitura (ex.: tela de configuração do administrador local).
export function reloadConfig(): Promise<AppConfig> {
  cached = null;
  return loadConfig();
}
