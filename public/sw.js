// GAV Kids — service worker (27/09/2026): deixa o app abrir sem internet.
// - Página (index.html) e config.json: rede primeiro; sem rede, a última cópia guardada.
// - Arquivos do app (assets/, imagens): cache primeiro (os nomes mudam a cada versão).
// - Chamadas à API (Apps Script, outro domínio) NUNCA passam por aqui: os dados
//   offline ficam na fila do próprio app (app/offline.ts), não no cache.
const CACHE = "gavkids-v1";
const SHELL = ["./", "./index.html", "./config.json", "./gav-logo-blue.png", "./gav-logo-cream.png", "./favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
      // Guarda também os arquivos JS/CSS da versão atual, lidos do próprio index.html.
      try {
        const html = await (await fetch("./index.html", { cache: "reload" })).text();
        const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await Promise.all(assets.map((u) => cache.add(u).catch(() => {})));
      } catch (e) {
        // sem rede na instalação: os arquivos entram no cache no próximo uso
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("gavkids-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: "no-store" });
    if (res && res.ok) cache.put(fallbackUrl || request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(fallbackUrl || request)) || (await cache.match("./index.html")) || (await cache.match("./"));
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API e fontes externas: sem interceptar
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "./index.html"));
  } else if (url.pathname.endsWith("/config.json")) {
    event.respondWith(networkFirst(req));
  } else if (url.pathname.endsWith("/sw.js")) {
    return;
  } else {
    event.respondWith(cacheFirst(req));
  }
});
