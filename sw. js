
const CACHE_NAME = "rk-foodie-offline-v1";
const OFFLINE_PAGE = "./offline%20intro.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.add(OFFLINE_PAGE);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match(OFFLINE_PAGE);

        if (offlinePage) {
          return offlinePage;
        }

        return new Response(
          "Offline game is not available yet. Please connect to the internet once.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain" }
          }
        );
      })
    );
  }
});
