import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../src/db";
import { enrichItem } from "../src/lib/enrich";
import { deleteItemImages } from "../src/lib/images";

const db = createDb(env.DB);
const now = new Date();

let seq = 5000;
async function makeItem(
  title = "shop.example.com",
  url = "https://shop.example.com/p/1",
) {
  const userId = seq++;
  const listId = seq++;
  const itemId = seq++;
  await db.insert(schema.users).values({
    id: userId,
    email: `e${userId}@example.com`,
    name: "Owner",
    createdAt: now,
  });
  await db.insert(schema.lists).values({
    id: listId,
    userId,
    name: "L",
    slug: `enrichtest${String(listId).padStart(12, "0")}`,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.items).values({
    id: itemId,
    listId,
    title,
    url,
    position: 0,
    createdAt: now,
    updatedAt: now,
  });
  return { itemId, listId, userId };
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

function shopFetch({
  withImage = true,
  imageType = "image/png",
} = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/p/1")) {
      const img = withImage
        ? '<meta property="og:image" content="https://cdn.example.com/pic.png" />'
        : "";
      return new Response(
        `<meta property="og:title" content="A Lovely Teapot" />${img}
         <meta property="og:price:amount" content="120" /><meta property="og:price:currency" content="NZD" />`,
        { headers: { "Content-Type": "text/html" } },
      );
    }
    if (url.includes("cdn.example.com")) {
      return new Response(PNG_BYTES, {
        headers: { "Content-Type": imageType },
      });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
}

describe("enrichItem", () => {
  it("fills title, price and stored image for an untouched row", async () => {
    const { itemId } = await makeItem();
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      shopFetch(),
    );
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.title).toBe("A Lovely Teapot");
    expect(item?.price).toBe("About $120");
    expect(item?.imageKey).toMatch(/^items\/\d+\/[a-f0-9]{16}\.png$/);
    // The bytes are really in R2 and served by /img/*.
    const res = await exports.default.fetch(
      `http://example.com/img/${item?.imageKey}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("never overwrites fields the owner already edited", async () => {
    const { itemId } = await makeItem();
    await db
      .update(schema.items)
      .set({ title: "My own name", price: "About $5" })
      .where(eq(schema.items.id, itemId));
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      shopFetch(),
    );
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.title).toBe("My own name");
    expect(item?.price).toBe("About $5");
    // The empty image slot still fills — that's untouched territory.
    expect(item?.imageKey).toBeTruthy();
  });

  it("leaves the row untouched when the fetch fails", async () => {
    const { itemId } = await makeItem();
    const failing = (async () => {
      throw new Error("blocked");
    }) as unknown as typeof fetch;
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      failing,
    );
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.title).toBe("shop.example.com");
    expect(item?.price).toBeNull();
    expect(item?.imageKey).toBeNull();
  });

  it("fills text fields even when the image is unusable", async () => {
    const { itemId } = await makeItem();
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      shopFetch({ imageType: "text/html" }),
    );
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.title).toBe("A Lovely Teapot");
    expect(item?.imageKey).toBeNull();
  });

  it("skips oversized images while still filling text fields", async () => {
    const { itemId } = await makeItem();
    const huge = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/p/1")) {
        return new Response(
          `<meta property="og:title" content="A Lovely Teapot" /><meta property="og:image" content="https://cdn.example.com/huge.png" />`,
          { headers: { "Content-Type": "text/html" } },
        );
      }
      return new Response(new Uint8Array(1024), {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(11 * 1024 * 1024),
        },
      });
    }) as typeof fetch;
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      huge,
    );
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.title).toBe("A Lovely Teapot");
    expect(item?.imageKey).toBeNull();
  });

  it("a Done submit rendered before enrichment does not undo it", async () => {
    const { itemId } = await makeItem();
    // Enrichment lands while the editor (SSR'd with placeholder values) is open.
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      shopFetch(),
    );
    // The user clicks Done without touching title/price: the form still
    // carries the stale SSR values as both current and initial.
    const sessionId = `enrichrace${itemId}`;
    const owner = await db.query.lists.findFirst({
      where: eq(
        schema.lists.id,
        (await db.query.items.findFirst({ where: eq(schema.items.id, itemId) }))
          ?.listId ?? -1,
      ),
    });
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: owner?.userId ?? -1,
      createdAt: now,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const body = new URLSearchParams({
      title: "shop.example.com",
      initialTitle: "shop.example.com",
      price: "",
      initialPrice: "",
      note: "",
      url: "https://shop.example.com/p/1",
    });
    const res = await exports.default.fetch(
      `http://example.com/items/${itemId}`,
      {
        method: "POST",
        body: body.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "http://example.com",
          Cookie: `session=${sessionId}`,
        },
        redirect: "manual",
      },
    );
    expect(res.status).toBe(302);
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.title).toBe("A Lovely Teapot");
    expect(item?.price).toBe("About $120");
  });

  it("clearing a polled-in price is a deliberate edit and persists", async () => {
    const { itemId, userId } = await makeItem();
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      shopFetch(),
    );
    const sessionId = `clearprice${itemId}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      createdAt: now,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // The poll swapped the price in AND moved the baseline with it; the
    // owner then cleared the field.
    const body = new URLSearchParams({
      title: "A Lovely Teapot",
      initialTitle: "A Lovely Teapot",
      price: "",
      initialPrice: "About $120",
      note: "",
      url: "https://shop.example.com/p/1",
    });
    const res = await exports.default.fetch(
      `http://example.com/items/${itemId}`,
      {
        method: "POST",
        body: body.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "http://example.com",
          Cookie: `session=${sessionId}`,
        },
        redirect: "manual",
      },
    );
    expect(res.status).toBe(302);
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    expect(item?.price).toBeNull();
    expect(item?.title).toBe("A Lovely Teapot");
  });

  it("cleanup removes the stored image", async () => {
    const { itemId } = await makeItem();
    await enrichItem(
      env,
      itemId,
      "https://shop.example.com/p/1",
      "shop.example.com",
      shopFetch(),
    );
    await deleteItemImages(env, itemId);
    const listing = await env.IMAGES.list({ prefix: `items/${itemId}/` });
    expect(listing.objects).toHaveLength(0);
  });
});

describe("/img/* serving", () => {
  it("404s unknown and malformed keys", async () => {
    expect(
      (
        await exports.default.fetch(
          "http://example.com/img/items/1/aaaaaaaaaaaaaaaa.png",
        )
      ).status,
    ).toBe(404);
    expect(
      (await exports.default.fetch("http://example.com/img/../secrets")).status,
    ).toBe(404);
    expect(
      (await exports.default.fetch("http://example.com/img/items/1/AAAA.png"))
        .status,
    ).toBe(404);
  });
});

describe("/items/:id.json", () => {
  it("is owner-scoped", async () => {
    const { itemId, userId } = await makeItem();
    const mySession = `jsonown${itemId}`;
    await db.insert(schema.sessions).values({
      id: mySession,
      userId,
      createdAt: now,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const mine = await exports.default.fetch(
      `http://example.com/items/${itemId}.json`,
      {
        headers: { Cookie: `session=${mySession}` },
      },
    );
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as { title: string }).title).toBe(
      "shop.example.com",
    );

    // Another user: 404. No session: redirect to login.
    const otherId = seq++;
    await db.insert(schema.users).values({
      id: otherId,
      email: `e${otherId}@example.com`,
      name: "Other",
      createdAt: now,
    });
    const otherSession = `jsonother${itemId}`;
    await db.insert(schema.sessions).values({
      id: otherSession,
      userId: otherId,
      createdAt: now,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const theirs = await exports.default.fetch(
      `http://example.com/items/${itemId}.json`,
      {
        headers: { Cookie: `session=${otherSession}` },
      },
    );
    expect(theirs.status).toBe(404);
    const anon = await exports.default.fetch(
      `http://example.com/items/${itemId}.json`,
      { redirect: "manual" },
    );
    expect(anon.status).toBe(302);
  });
});
