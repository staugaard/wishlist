// Validator-keyed edge caching for the public pages (spec: phase 4).
//
// The giver page's cache key embeds the list's updatedAt; every mutation of
// a list or its items touches that timestamp, so an edit makes the very next
// request construct a new key and miss straight to a fresh render. Nothing
// is ever purged — old entries age out via s-maxage.

const EDGE_TTL_SECONDS = 30 * 24 * 60 * 60;

// Synthetic, non-routable key URL — never collides with real requests.
export function listCacheKey(slug: string, updatedAt: Date): Request {
  return new Request(
    `https://edge-cache.hinted.internal/l/${slug}@${Math.floor(updatedAt.getTime() / 1000)}`,
  );
}

export async function matchCached(
  key: Request,
  marker: "HIT",
): Promise<Response | undefined> {
  const cached = await caches.default.match(key);
  if (!cached) return undefined;
  const res = new Response(cached.body, cached);
  res.headers.set("X-Hinted-Cache", marker);
  // The stored copy carries the edge TTL; the browser must always revalidate.
  res.headers.set("Cache-Control", "no-cache");
  return res;
}

// Store a copy carrying the edge TTL, return the original marked as a miss.
export function storeAndMark(
  key: Request,
  res: Response,
  waitUntil: (p: Promise<unknown>) => void,
  browserCacheControl = "no-cache",
): Response {
  const forCache = new Response(res.clone().body, res);
  forCache.headers.set("Cache-Control", `public, s-maxage=${EDGE_TTL_SECONDS}`);
  waitUntil(caches.default.put(key, forCache));
  res.headers.set("X-Hinted-Cache", "MISS");
  res.headers.set("Cache-Control", browserCacheControl);
  return res;
}
