/* Service worker: network-first.
   Mostra SEMPRE l'ultima versione quando si è online (niente più versioni
   "bloccate" in cache), con fallback alla cache quando si è offline. */
const CACHE = 'svezzamento-v4';
const ASSETS = [
	'.',
	'index.html',
	'styles.css',
	'data.js',
	'app.js',
	'icon.svg',
	'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	event.respondWith(
		fetch(event.request)
			.then((res) => {
				const copy = res.clone();
				caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
				return res;
			})
			.catch(() =>
				caches.match(event.request).then((cached) => cached || caches.match('index.html')),
			),
	);
});
