const CACHE_NAME = 'ws-abarrotes-pwa-v4';
const APP_SHELL = [
	'./Abarrotes.html',
	'./pos.js',
	'./pos.css',
	'./abarrotes-base.css',
	'./manifest-abarrotes.webmanifest',
	'./supabase-config.js',
	'./icon.svg'
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => cache.addAll(APP_SHELL))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(
				keys
					.filter(key => key.startsWith('ws-abarrotes-pwa-') && key !== CACHE_NAME)
					.map(key => caches.delete(key))
			))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	if (event.request.method !== 'GET') return;
	const requestUrl = new URL(event.request.url);
	const isSameOrigin = requestUrl.origin === self.location.origin;
	const isSupabaseLibrary = requestUrl.hostname === 'cdn.jsdelivr.net';
	if (!isSameOrigin && !isSupabaseLibrary) return;

	event.respondWith((async () => {
		const cache = await caches.open(CACHE_NAME);
		const cached = await cache.match(event.request);

		if (isSameOrigin) {
			try {
				const response = await fetch(event.request);
				if (response.ok) await cache.put(event.request, response.clone());
				return response;
			} catch {
				if (cached) return cached;
				if (event.request.mode === 'navigate') {
					return (await cache.match('./Abarrotes.html')) || Response.error();
				}
				return Response.error();
			}
		}

		if (cached) {
			fetch(event.request)
				.then(response => {
					if (response.ok || response.type === 'opaque') return cache.put(event.request, response);
				})
				.catch(() => {});
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
