const TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Download a product image once and keep our own copy — hotlinks rot and
// leak referers. Returns the R2 key, or undefined on any failure.
export async function storeItemImage(
  env: CloudflareBindings,
  itemId: number,
  imageUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const res = await fetcher(imageUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Some CDNs (e.g. Wikimedia) 403 UA-less requests.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "image/*",
      },
    });
    if (!res.ok || !res.body) return undefined;
    const contentType =
      (res.headers.get("Content-Type") ?? "").split(";")[0]?.trim() ?? "";
    const ext = EXTENSIONS[contentType];
    if (!ext) return undefined;
    const declared = Number(res.headers.get("Content-Length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) return undefined;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(value);
    }
    if (total === 0) return undefined;
    const bytes = concatChunks(chunks, total);

    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const key = `items/${itemId}/${hash}.${ext}`;
    await env.IMAGES.put(key, bytes, { httpMetadata: { contentType } });
    return key;
  } catch {
    return undefined;
  }
}

// Best-effort removal of an item's stored images.
export async function deleteItemImages(
  env: CloudflareBindings,
  itemId: number,
): Promise<void> {
  try {
    const listing = await env.IMAGES.list({ prefix: `items/${itemId}/` });
    if (listing.objects.length > 0) {
      await env.IMAGES.delete(listing.objects.map((o) => o.key));
    }
  } catch (err) {
    console.error(
      `Image cleanup failed for item ${itemId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
