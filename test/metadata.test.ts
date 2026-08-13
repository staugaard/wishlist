import { describe, expect, it } from "vitest";
import { fetchMetadata, formatPrice } from "../src/lib/metadata";

function stubFetch(
  body: string,
  contentType = "text/html; charset=utf-8",
): typeof fetch {
  return (async () =>
    new Response(body, {
      headers: { "Content-Type": contentType },
    })) as typeof fetch;
}

const PAGE = "https://shop.example.com/products/kettle";

describe("fetchMetadata", () => {
  it("reads og tags", async () => {
    const html = `<html><head>
      <meta property="og:title" content="Stelton EM77 Kettle" />
      <meta property="og:image" content="https://cdn.example.com/kettle.jpg" />
      <meta property="og:price:amount" content="249.00" />
      <meta property="og:price:currency" content="NZD" />
      <title>ignored</title></head><body></body></html>`;
    const meta = await fetchMetadata(PAGE, stubFetch(html));
    expect(meta.title).toBe("Stelton EM77 Kettle");
    expect(meta.imageUrl).toBe("https://cdn.example.com/kettle.jpg");
    expect(meta.price).toBe("About $249");
  });

  it("falls back to twitter tags, then the title tag", async () => {
    const twitter = await fetchMetadata(
      PAGE,
      stubFetch(
        '<meta name="twitter:title" content="Twitter Title" /><meta name="twitter:image" content="/img/x.png" />',
      ),
    );
    expect(twitter.title).toBe("Twitter Title");
    expect(twitter.imageUrl).toBe("https://shop.example.com/img/x.png");

    const titleOnly = await fetchMetadata(
      PAGE,
      stubFetch("<title>  Plain\n  Title </title>"),
    );
    expect(titleOnly.title).toBe("Plain Title");
    expect(titleOnly.imageUrl).toBeUndefined();
  });

  it("reads price from JSON-LD Product blocks, tolerating @graph and arrays", async () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"x"},
        {"@type":["Product"],"name":"Kettle","offers":[{"@type":"Offer","price":"649.95","priceCurrency":"DKK"}]}
      ]}
    </script>`;
    const meta = await fetchMetadata(PAGE, stubFetch(html));
    expect(meta.price).toBe("About 650 kr");
  });

  it("survives malformed JSON-LD", async () => {
    const meta = await fetchMetadata(
      PAGE,
      stubFetch(
        '<script type="application/ld+json">{nope</script><title>T</title>',
      ),
    );
    expect(meta.title).toBe("T");
    expect(meta.price).toBeUndefined();
  });

  it("rejects non-HTML responses and network failures", async () => {
    expect(
      await fetchMetadata(PAGE, stubFetch("{}", "application/json")),
    ).toEqual({});
    const failing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    expect(await fetchMetadata(PAGE, failing)).toEqual({});
  });

  it("enforces the read cap: early tags parse, tags beyond 500KB do not", async () => {
    const html = `<meta property="og:title" content="Early Bird" />${"x".repeat(600 * 1024)}<meta property="og:image" content="https://cdn.example.com/late.png" />`;
    const meta = await fetchMetadata(PAGE, stubFetch(html));
    expect(meta.title).toBe("Early Bird");
    // The image tag sits past the cap and must NOT have been parsed.
    expect(meta.imageUrl).toBeUndefined();
  });

  it("resolves relative images against the post-redirect final URL", async () => {
    const redirected = (async () => {
      const res = new Response(
        '<meta property="og:image" content="/pics/kettle.jpg" />',
        {
          headers: { "Content-Type": "text/html" },
        },
      );
      // Simulate fetch's redirect-following: Response.url is the FINAL url.
      Object.defineProperty(res, "url", {
        value: "https://real-shop.example.net/product/9",
      });
      return res;
    }) as typeof fetch;
    const meta = await fetchMetadata(
      "https://redirector.example.com/x",
      redirected,
    );
    expect(meta.imageUrl).toBe("https://real-shop.example.net/pics/kettle.jpg");
  });

  it("refuses unsafe image URLs", async () => {
    const meta = await fetchMetadata(
      PAGE,
      stubFetch('<meta property="og:image" content="javascript:alert(1)" />'),
    );
    expect(meta.imageUrl).toBeUndefined();
  });
});

describe("formatPrice", () => {
  it("formats known currencies and refuses unknown ones", () => {
    expect(formatPrice("1234.56", "NZD")).toBe("About $1,235");
    expect(formatPrice(99, "EUR")).toBe("About €99");
    expect(formatPrice("500", "DKK")).toBe("About 500 kr");
    expect(formatPrice("500", "XYZ")).toBeUndefined();
    expect(formatPrice("0", "NZD")).toBeUndefined();
    expect(formatPrice("not-a-number", "NZD")).toBeUndefined();
  });
});
