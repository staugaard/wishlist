import { safeHttpUrl } from "./url";

export type PageMetadata = {
  title?: string;
  imageUrl?: string;
  price?: string;
};

const TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 500 * 1024;
const MAX_TITLE_LEN = 200;

// Currency → [symbol, position]. Unknown currencies produce no price —
// never invent one.
const CURRENCIES: Record<string, [string, "prefix" | "suffix"]> = {
  NZD: ["$", "prefix"],
  USD: ["$", "prefix"],
  AUD: ["$", "prefix"],
  CAD: ["$", "prefix"],
  EUR: ["€", "prefix"],
  GBP: ["£", "prefix"],
  DKK: [" kr", "suffix"],
  SEK: [" kr", "suffix"],
  NOK: [" kr", "suffix"],
};

export function formatPrice(
  amount: string | number | undefined,
  currency: string | undefined,
): string | undefined {
  if (amount == null || !currency) return undefined;
  const value =
    typeof amount === "number"
      ? amount
      : Number.parseFloat(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const entry = CURRENCIES[currency.toUpperCase()];
  if (!entry) return undefined;
  const rounded = Math.round(value).toLocaleString("en-NZ");
  const [symbol, position] = entry;
  return position === "prefix"
    ? `About ${symbol}${rounded}`
    : `About ${rounded}${symbol}`;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function cleanText(raw: string): string | undefined {
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LEN).trim();
  return text.length > 0 ? text : undefined;
}

// Pull price from JSON-LD Product blocks (the only place many shops put it).
function priceFromJsonLd(blocks: string[]): string | undefined {
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block);
      const nodes: unknown[] = [];
      const push = (n: unknown) => {
        if (Array.isArray(n)) for (const x of n) push(x);
        else if (n && typeof n === "object") nodes.push(n);
      };
      push(parsed);
      for (const node of [...nodes]) {
        const graph = (node as { "@graph"?: unknown })["@graph"];
        if (graph) push(graph);
      }
      for (const node of nodes) {
        const type = (node as { "@type"?: unknown })["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (!types.includes("Product")) continue;
        const offersRaw = (node as { offers?: unknown }).offers;
        const offers = Array.isArray(offersRaw) ? offersRaw : [offersRaw];
        for (const offer of offers) {
          if (!offer || typeof offer !== "object") continue;
          const o = offer as {
            price?: string | number;
            priceCurrency?: string;
          };
          const price = formatPrice(o.price, o.priceCurrency);
          if (price) return price;
        }
      }
    } catch {
      // Malformed JSON-LD is the norm, not the exception.
    }
  }
  return undefined;
}

export async function fetchMetadata(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<PageMetadata> {
  try {
    const res = await fetcher(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-NZ,en;q=0.8",
      },
    });
    if (!res.ok || !res.body) return {};
    const contentType = res.headers.get("Content-Type") ?? "";
    if (!contentType.includes("text/html")) return {};

    // Cap the read; a truncated document still yields its <head> metadata.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      // Enforce the cap inside a chunk too — one giant chunk must not
      // defeat the memory bound.
      const room = MAX_HTML_BYTES - total;
      const chunk = value.byteLength > room ? value.subarray(0, room) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    await reader.cancel().catch(() => {});
    const html = concatChunks(chunks, total);

    const meta: Record<string, string> = {};
    let titleTag = "";
    const jsonLdBlocks: string[] = [];
    let currentJsonLd: string | null = null;

    const grab = (key: string) => ({
      element(el: { getAttribute(name: string): string | null }) {
        const content = el.getAttribute("content");
        if (content && !meta[key]) meta[key] = content;
      },
    });

    const rewriter = new HTMLRewriter()
      .on('meta[property="og:title"]', grab("og:title"))
      .on('meta[name="twitter:title"]', grab("twitter:title"))
      .on('meta[property="og:image"]', grab("og:image"))
      .on('meta[property="og:image:url"]', grab("og:image"))
      .on('meta[name="twitter:image"]', grab("twitter:image"))
      .on('meta[property="og:price:amount"]', grab("og:price:amount"))
      .on('meta[property="og:price:currency"]', grab("og:price:currency"))
      .on('meta[property="product:price:amount"]', grab("product:price:amount"))
      .on(
        'meta[property="product:price:currency"]',
        grab("product:price:currency"),
      )
      .on("title", {
        text(t: { text: string }) {
          titleTag += t.text;
        },
      })
      .on('script[type="application/ld+json"]', {
        element() {
          currentJsonLd = "";
        },
        text(t: { text: string; lastInTextNode: boolean }) {
          if (currentJsonLd != null) {
            currentJsonLd += t.text;
            if (t.lastInTextNode) {
              jsonLdBlocks.push(currentJsonLd);
              currentJsonLd = null;
            }
          }
        },
      });

    await rewriter.transform(new Response(html)).arrayBuffer();

    const title = cleanText(
      meta["og:title"] ?? meta["twitter:title"] ?? titleTag,
    );

    let imageUrl: string | undefined;
    const rawImage = meta["og:image"] ?? meta["twitter:image"];
    if (rawImage) {
      try {
        // Resolve against the FINAL url — redirected product links must not
        // resolve relative images against the redirector's host.
        imageUrl = safeHttpUrl(new URL(rawImage, res.url || url).href);
      } catch {
        imageUrl = undefined;
      }
    }

    const price =
      formatPrice(meta["og:price:amount"], meta["og:price:currency"]) ??
      formatPrice(
        meta["product:price:amount"],
        meta["product:price:currency"],
      ) ??
      priceFromJsonLd(jsonLdBlocks);

    return { title, imageUrl, price };
  } catch {
    return {};
  }
}
