/* Mantém a consulta funcionando com internet fraca ou sem internet.
   Sempre tenta buscar a versão mais nova primeiro; se a rede falhar ou demorar mais de
   4 segundos, usa a última cópia salva no aparelho. */
const CACHE = 'estoque-yella-v7';
const ESPERA_MAXIMA = 4000;
const ESSENCIAIS = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'dados/lojas.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const semCacheAntigo = (url) => new Request(url, { cache: 'reload' });
    await cache.addAll(ESSENCIAIS.map(semCacheAntigo));
    try {
      const lojas = await (await cache.match('dados/lojas.json')).json();
      await cache.addAll(lojas.lojas.filter((loja) => loja.arquivo).map((loja) => semCacheAntigo(loja.arquivo)));
    } catch (erro) { /* os dados das lojas entram no cache na primeira consulta */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((nome) => nome !== CACHE).map((nome) => caches.delete(nome)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  if (new URL(pedido.url).origin !== self.location.origin) return;

  // O GitHub Pages manda guardar os arquivos por 10 minutos; "no-cache" confere com o servidor
  // a cada acesso (resposta curta quando nada mudou), para a versão nova aparecer na hora.
  const daRede = pedido.mode === 'navigate' ? fetch(pedido) : fetch(pedido, { cache: 'no-cache' });
  // guarda a resposta nova no aparelho, mesmo quando a cópia antiga for usada nesta vez
  evento.waitUntil(daRede.then((resposta) => {
    if (!resposta.ok) return undefined;
    const copia = resposta.clone();
    return caches.open(CACHE).then((cache) => cache.put(pedido, copia));
  }).catch(() => {}));

  evento.respondWith((async () => {
    const salvo = await caches.match(pedido, { ignoreSearch: true });
    if (!salvo) return daRede;
    const limite = new Promise((resolver) => { setTimeout(() => resolver(salvo), ESPERA_MAXIMA); });
    return Promise.race([daRede.catch(() => salvo), limite]);
  })());
});
