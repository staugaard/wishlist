import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../src/db";
import { newSessionId } from "../src/lib/slug";

const db = createDb(env.DB);
const now = new Date();

let seq = 9000;
async function makeListWithItem() {
  const userId = seq++;
  const listId = seq++;
  const itemId = seq++;
  await db.insert(schema.users).values({
    id: userId,
    email: `c${userId}@example.com`,
    name: "Owner One",
    createdAt: now,
  });
  await db.insert(schema.lists).values({
    id: listId,
    userId,
    name: "Cached list",
    slug: `cachetest${String(listId).padStart(13, "0")}`,
    createdAt: now,
    updatedAt: new Date(Date.now() - 60_000),
  });
  await db.insert(schema.items).values({
    id: itemId,
    listId,
    title: "First thing",
    position: 0,
    createdAt: now,
    updatedAt: now,
  });
  const list = await db.query.lists.findFirst({
    where: eq(schema.lists.id, listId),
  });
  return { userId, listId, itemId, slug: list?.slug ?? "" };
}

async function makeSession(userId: number) {
  const id = newSessionId();
  await db.insert(schema.sessions).values({
    id,
    userId,
    createdAt: now,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return `session=${id}`;
}

const get = (path: string) =>
  exports.default.fetch(`http://example.com${path}`);

describe("giver page edge caching", () => {
  it("misses, then hits, then misses again after an item edit", async () => {
    const { slug, itemId, userId } = await makeListWithItem();

    const first = await get(`/l/${slug}`);
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Hinted-Cache")).toBe("MISS");
    expect(first.headers.get("Cache-Control")).toBe("no-cache");

    const second = await get(`/l/${slug}`);
    expect(second.headers.get("X-Hinted-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe("no-cache");
    expect(second.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await second.text()).toContain("First thing");

    // An owner edit rolls the validator → next request is a fresh MISS.
    const cookie = await makeSession(userId);
    const edit = await exports.default.fetch(
      `http://example.com/items/${itemId}`,
      {
        method: "POST",
        body: new URLSearchParams({
          title: "Renamed thing",
          initialTitle: "First thing",
          price: "",
          initialPrice: "",
          note: "",
          url: "",
        }).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "http://example.com",
          Cookie: cookie,
        },
        redirect: "manual",
      },
    );
    expect(edit.status).toBe(302);

    const third = await get(`/l/${slug}`);
    expect(third.headers.get("X-Hinted-Cache")).toBe("MISS");
    expect(await third.text()).toContain("Renamed thing");
  });

  it("item mutations touch the parent list's updatedAt", async () => {
    const { listId, itemId, userId } = await makeListWithItem();
    const before =
      (
        await db.query.lists.findFirst({ where: eq(schema.lists.id, listId) })
      )?.updatedAt.getTime() ?? 0;
    const cookie = await makeSession(userId);
    await exports.default.fetch(`http://example.com/items/${itemId}/delete`, {
      method: "POST",
      body: "",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://example.com",
        Cookie: cookie,
      },
      redirect: "manual",
    });
    const after =
      (
        await db.query.lists.findFirst({ where: eq(schema.lists.id, listId) })
      )?.updatedAt.getTime() ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it("every mutation path rolls the cache key", async () => {
    const { slug, listId, itemId, userId } = await makeListWithItem();
    const cookie = await makeSession(userId);
    const state = async () =>
      (await get(`/l/${slug}`)).headers.get("X-Hinted-Cache");
    const post = (path: string, data: Record<string, string>) =>
      exports.default.fetch(`http://example.com${path}`, {
        method: "POST",
        body: new URLSearchParams(data).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "http://example.com",
          Cookie: cookie,
        },
        redirect: "manual",
      });

    await state(); // fill
    expect(await state()).toBe("HIT");

    // Paste-create
    await post(`/lists/${listId}/items`, { input: "Another thing" });
    expect(await state()).toBe("MISS");
    expect(await state()).toBe("HIT");

    // Move
    const rows = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, listId))
      .orderBy(schema.items.position);
    await post(`/items/${rows[1]?.id}/move`, { direction: "up" });
    expect(await state()).toBe("MISS");
    expect(await state()).toBe("HIT");

    // List settings
    await post(`/lists/${listId}`, { name: "Renamed list" });
    expect(await state()).toBe("MISS");
    expect(await state()).toBe("HIT");

    // Background enrichment
    const { enrichItem } = await import("../src/lib/enrich");
    const stub = (async () =>
      new Response('<meta property="og:title" content="Enriched Title" />', {
        headers: { "Content-Type": "text/html" },
      })) as unknown as typeof fetch;
    await db
      .update(schema.items)
      .set({ title: "host.example.com", url: "https://host.example.com/x" })
      .where(eq(schema.items.id, itemId));
    // Direct DB write above doesn't touch — enrichment itself must.
    await enrichItem(
      env,
      itemId,
      "https://host.example.com/x",
      "host.example.com",
      stub,
    );
    expect(await state()).toBe("MISS");
    expect(await (await get(`/l/${slug}`)).text()).toContain("Enriched Title");
  });

  it("touches are strictly monotonic even within one second", async () => {
    const { listId } = await makeListWithItem();
    const { touchList } = await import("../src/db");
    const read = async () =>
      (
        await db.query.lists.findFirst({ where: eq(schema.lists.id, listId) })
      )?.updatedAt.getTime() ?? 0;
    const t0 = await read();
    await touchList(db, listId);
    const t1 = await read();
    await touchList(db, listId);
    const t2 = await read();
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
  });

  it("a deleted list 404s immediately even when previously cached", async () => {
    const { slug, listId, userId } = await makeListWithItem();
    await get(`/l/${slug}`);
    expect((await get(`/l/${slug}`)).headers.get("X-Hinted-Cache")).toBe("HIT");
    const cookie = await makeSession(userId);
    await exports.default.fetch(`http://example.com/lists/${listId}/delete`, {
      method: "POST",
      body: "",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://example.com",
        Cookie: cookie,
      },
      redirect: "manual",
    });
    expect((await get(`/l/${slug}`)).status).toBe(404);
  });

  it("caches /img/* on repeat requests", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const key = "items/999999/aabbccddeeff0011.png";
    await env.IMAGES.put(key, bytes, {
      httpMetadata: { contentType: "image/png" },
    });
    const first = await get(`/img/${key}`);
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Hinted-Cache")).toBe("MISS");
    expect(first.headers.get("Cache-Control")).toContain("immutable");
    const second = await get(`/img/${key}`);
    expect(second.headers.get("X-Hinted-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(bytes);
  });
});

describe("polish", () => {
  it("links the manifest, icons, theme metas and pre-paint script", async () => {
    // Static assets are served by the runtime asset layer in prod; in tests we
    // just assert the renderer links them.
    const { slug } = await makeListWithItem();
    const html = await (await get(`/l/${slug}`)).text();
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("/icons/apple-touch-icon.png");
    expect(html).toContain('name="theme-color"');
    expect(html).toContain("hinted-theme");
  });

  it("an empty list greets givers gently", async () => {
    const userId = seq++;
    const listId = seq++;
    await db.insert(schema.users).values({
      id: userId,
      email: `c${userId}@example.com`,
      name: "Owner",
      createdAt: now,
    });
    await db.insert(schema.lists).values({
      id: listId,
      userId,
      name: "Empty list",
      slug: `cacheempty${String(listId).padStart(12, "0")}`,
      createdAt: now,
      updatedAt: now,
    });
    const html = await (
      await get(`/l/cacheempty${String(listId).padStart(12, "0")}`)
    ).text();
    expect(html).toContain("Nothing here yet — check back soon.");
  });

  it("giver page carries a description meta", async () => {
    const { slug, listId } = await makeListWithItem();
    await db
      .update(schema.lists)
      .set({ intro: "A few things I'd love." })
      .where(eq(schema.lists.id, listId));
    const html = await (await get(`/l/${slug}`)).text();
    expect(html).toContain('name="description"');
  });
});
