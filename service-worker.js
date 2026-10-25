const CACHE_NAME = 'ws-services-pwa-v15';
const APP_FILES = ['./index.html', './recibo.html', './manifest.webmanifest', './icon.svg', './supabase-config.js'];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => cache.addAll(APP_FILES))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(key => key.startsWith('ws-services-pwa-') && key !== CACHE_NAME).map(key => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	if (event.request.method !== 'GET') return;
	const requestUrl = new URL(event.request.url);
	const isAppFile = requestUrl.origin === self.location.origin;
	const isPdfLibrary = requestUrl.hostname === 'cdnjs.cloudflare.com';
	const isSupabaseLibrary = requestUrl.hostname === 'cdn.jsdelivr.net';
	if (!isAppFile && !isPdfLibrary && !isSupabaseLibrary) return;

	event.respondWith((async () => {
		const cache = await caches.open(CACHE_NAME);
		const cached = await cache.match(event.request);
		if (isAppFile) {
			try {
				const response = await fetch(event.request);
				if (response.ok) await cache.put(event.request, response.clone());
				return response;
			} catch {
				if (cached) return cached;
				if (event.request.mode === 'navigate') {
					return (await cache.match('./index.html')) || (await cache.match('./recibo.html')) || Response.error();
				}
				return Response.error();
			}
		}

		if (cached) {
			fetch(event.request).then(response => cache.put(event.request, response)).catch(() => {});
			return cached;
		}

		try {
			const response = await fetch(event.request);
			if (response.ok || response.type === 'opaque') await cache.put(event.request, response.clone());
			return response;
		} catch {
			return Response.error();
		}
	})());
});
