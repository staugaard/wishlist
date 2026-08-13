import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../src/db";
import { newSessionId } from "../src/lib/slug";

const db = createDb(env.DB);
const now = new Date();
const IN_90_DAYS = () => new Date(Date.now() + 90 * 24 * 3600 * 1000);

let seq = 1000;
async function makeUser(name = "Test Owner") {
  const id = seq++;
  await db
    .insert(schema.users)
    .values({ id, email: `owner${id}@example.com`, name, createdAt: now });
  return { id, email: `owner${id}@example.com` };
}

async function makeSession(userId: number) {
  const id = newSessionId();
  await db
    .insert(schema.sessions)
    .values({ id, userId, createdAt: now, expiresAt: IN_90_DAYS() });
  return `session=${id}`;
}

function fetchApp(path: string, init?: RequestInit & { cookie?: string }) {
  const headers = new Headers(init?.headers);
  if (init?.cookie) headers.set("Cookie", init.cookie);
  return exports.default.fetch(`http://example.com${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
}

function form(data: Record<string, string>) {
  const body = new URLSearchParams(data);
  return {
    method: "POST",
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Strict CSRF: every POST needs positive same-origin evidence.
      Origin: "http://example.com",
    },
  } satisfies RequestInit;
}

describe("auth flow", () => {
  it("signs in end to end with the emailed code", async () => {
    const { email } = await makeUser("Karen Andersen");
    const res = await fetchApp("/login", form({ email }));
    expect(res.status).toBe(200);
    const code = res.headers.get("X-Dev-Otp");
    expect(code).toMatch(/^\d{6}$/);

    const verify = await fetchApp(
      "/login/verify",
      form({ email, code: code ?? "" }),
    );
    expect(verify.status).toBe(302);
    expect(verify.headers.get("Location")).toBe("/");
    const cookie = verify.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");

    const sessionCookie = cookie.split(";")[0] ?? "";
    const home = await fetchApp("/", { cookie: sessionCookie });
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Your lists");
  });

  it("responds identically for unknown emails", async () => {
    const { email } = await makeUser();
    const known = await fetchApp("/login", form({ email }));
    const unknown = await fetchApp(
      "/login",
      form({ email: "nobody@example.com" }),
    );
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(
      (await known.text()).replace(email, "nobody@example.com"),
    );
    expect(unknown.headers.get("X-Dev-Otp")).toBeNull();
  });

  it("invalidates the code after five wrong attempts", async () => {
    const { email } = await makeUser();
    const res = await fetchApp("/login", form({ email }));
    const code = res.headers.get("X-Dev-Otp") ?? "";
    for (let i = 0; i < 5; i++) {
      const bad = await fetchApp(
        "/login/verify",
        form({ email, code: "000000" }),
      );
      expect(bad.status).toBe(400);
    }
    // Correct code no longer works — the row is exhausted.
    const after = await fetchApp("/login/verify", form({ email, code }));
    expect(after.status).toBe(400);
  });

  it("rejects an expired code", async () => {
    const { email } = await makeUser();
    const res = await fetchApp("/login", form({ email }));
    const code = res.headers.get("X-Dev-Otp") ?? "";
    await db
      .update(schema.otpCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.otpCodes.email, email));
    const verify = await fetchApp("/login/verify", form({ email, code }));
    expect(verify.status).toBe(400);
  });

  it("cools down resends for 60 seconds", async () => {
    const { email } = await makeUser();
    const first = await fetchApp("/login", form({ email }));
    const code1 = first.headers.get("X-Dev-Otp");
    const second = await fetchApp("/login", form({ email }));
    expect(second.headers.get("X-Dev-Otp")).toBeNull();
    // The original code still works.
    const verify = await fetchApp(
      "/login/verify",
      form({ email, code: code1 ?? "" }),
    );
    expect(verify.status).toBe(302);
  });

  it("a resend does not reset the guessing budget", async () => {
    const { email } = await makeUser();
    const first = await fetchApp("/login", form({ email }));
    expect(first.headers.get("X-Dev-Otp")).toMatch(/^\d{6}$/);
    // Burn 4 attempts against code 1.
    for (let i = 0; i < 4; i++) {
      await fetchApp("/login/verify", form({ email, code: "000000" }));
    }
    // Skip the cooldown, resend (new code, same window).
    await db
      .update(schema.otpCodes)
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .where(eq(schema.otpCodes.email, email));
    const second = await fetchApp("/login", form({ email }));
    const code2 = second.headers.get("X-Dev-Otp") ?? "";
    expect(code2).toMatch(/^\d{6}$/);
    // One wrong guess exhausts the carried-over budget…
    await fetchApp("/login/verify", form({ email, code: "999999" }));
    // …so even the correct new code is refused.
    const after = await fetchApp("/login/verify", form({ email, code: code2 }));
    expect(after.status).toBe(400);
  });

  it("caps sends per window", async () => {
    const { email } = await makeUser();
    for (let i = 0; i < 2; i++) {
      const res = await fetchApp("/login", form({ email }));
      expect(res.headers.get("X-Dev-Otp")).toMatch(/^\d{6}$/);
      await db
        .update(schema.otpCodes)
        .set({ createdAt: new Date(Date.now() - 61_000) })
        .where(eq(schema.otpCodes.email, email));
    }
    const third = await fetchApp("/login", form({ email }));
    expect(third.headers.get("X-Dev-Otp")).toMatch(/^\d{6}$/);
    await db
      .update(schema.otpCodes)
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .where(eq(schema.otpCodes.email, email));
    // Fourth send in the same unexpired window: silently refused.
    const fourth = await fetchApp("/login", form({ email }));
    expect(fourth.status).toBe(200);
    expect(fourth.headers.get("X-Dev-Otp")).toBeNull();
  });

  it("logs out", async () => {
    const user = await makeUser();
    const cookie = await makeSession(user.id);
    const out = await fetchApp("/logout", { ...form({}), cookie });
    expect(out.status).toBe(302);
    const home = await fetchApp("/", { cookie });
    expect(await home.text()).not.toContain("Your lists");
  });
});

describe("authorization", () => {
  it("hides other users' lists and items (404, GET and POST)", async () => {
    const alice = await makeUser("Alice");
    const bob = await makeUser("Bob");
    const listId = seq++;
    await db.insert(schema.lists).values({
      id: listId,
      userId: alice.id,
      name: "Alice's list",
      slug: `authztest${String(listId).padStart(13, "0")}`,
      createdAt: now,
      updatedAt: now,
    });
    const itemId = seq++;
    await db.insert(schema.items).values({
      id: itemId,
      listId,
      title: "Secret thing",
      position: 0,
      createdAt: now,
      updatedAt: now,
    });

    const bobCookie = await makeSession(bob.id);
    expect(
      (await fetchApp(`/lists/${listId}`, { cookie: bobCookie })).status,
    ).toBe(404);
    expect(
      (
        await fetchApp(`/lists/${listId}`, {
          ...form({ name: "Hax" }),
          cookie: bobCookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetchApp(`/items/${itemId}`, {
          ...form({ title: "Hax" }),
          cookie: bobCookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetchApp(`/items/${itemId}/delete`, {
          ...form({}),
          cookie: bobCookie,
        })
      ).status,
    ).toBe(404);
  });

  it("redirects unauthenticated owner routes to login", async () => {
    const res = await fetchApp("/lists/new");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });

  it("rejects cross-site POSTs", async () => {
    const user = await makeUser();
    const cookie = await makeSession(user.id);
    const res = await fetchApp("/lists", {
      ...form({ name: "CSRF list" }),
      cookie,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://evil.example.net",
      },
    });
    expect(res.status).toBe(403);
  });

  it("fails closed: POSTs without origin evidence are rejected", async () => {
    const user = await makeUser();
    const cookie = await makeSession(user.id);
    const res = await fetchApp("/lists", {
      method: "POST",
      body: new URLSearchParams({ name: "Headerless" }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cookie,
    });
    expect(res.status).toBe(403);
  });
});

describe("owner CRUD", () => {
  async function ownerSetup() {
    const user = await makeUser("Sofie Demo");
    const cookie = await makeSession(user.id);
    return { user, cookie };
  }

  async function createList(cookie: string, name = "My birthday") {
    const res = await fetchApp("/lists", { ...form({ name }), cookie });
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    const id = Number(location.split("/").pop());
    return id;
  }

  it("creates a list with a well-formed slug", async () => {
    const { cookie } = await ownerSetup();
    const id = await createList(cookie);
    const list = await db.query.lists.findFirst({
      where: eq(schema.lists.id, id),
    });
    expect(list?.slug).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("adds items from the paste bar: URL vs plain text", async () => {
    const { cookie } = await ownerSetup();
    const id = await createList(cookie);
    await fetchApp(`/lists/${id}/items`, {
      ...form({ input: "https://shop.example.com/socks?x=1" }),
      cookie,
    });
    await fetchApp(`/lists/${id}/items`, {
      ...form({ input: "Wool socks, any colour" }),
      cookie,
    });
    const rows = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, id));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("shop.example.com");
    expect(rows[0]?.url).toBe("https://shop.example.com/socks?x=1");
    expect(rows[1]?.title).toBe("Wool socks, any colour");
    expect(rows[1]?.url).toBeNull();
  });

  it("updates and removes items via the editor", async () => {
    const { cookie } = await ownerSetup();
    const id = await createList(cookie);
    await fetchApp(`/lists/${id}/items`, {
      ...form({ input: "A thing" }),
      cookie,
    });
    const [item] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, id));
    expect(item).toBeDefined();
    if (!item) return;

    await fetchApp(`/items/${item.id}`, {
      ...form({
        title: "A better thing",
        note: "Size M",
        price: "About 100 kr",
        url: "https://example.com/t",
        priority: "on",
      }),
      cookie,
    });
    const updated = await db.query.items.findFirst({
      where: eq(schema.items.id, item.id),
    });
    expect(updated?.title).toBe("A better thing");
    expect(updated?.note).toBe("Size M");
    expect(updated?.priority).toBe(true);

    await fetchApp(`/items/${item.id}/delete`, { ...form({}), cookie });
    expect(
      await db.query.items.findFirst({ where: eq(schema.items.id, item.id) }),
    ).toBeUndefined();
  });

  it("moves items up and down with boundary no-ops", async () => {
    const { cookie } = await ownerSetup();
    const id = await createList(cookie);
    for (const t of ["First", "Second", "Third"]) {
      await fetchApp(`/lists/${id}/items`, { ...form({ input: t }), cookie });
    }
    const titles = async () =>
      (
        await db
          .select()
          .from(schema.items)
          .where(eq(schema.items.listId, id))
          .orderBy(schema.items.position)
      ).map((i) => i.title);
    const [first, , third] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, id))
      .orderBy(schema.items.position);

    await fetchApp(`/items/${third?.id}/move`, {
      ...form({ direction: "up" }),
      cookie,
    });
    expect(await titles()).toEqual(["First", "Third", "Second"]);
    await fetchApp(`/items/${first?.id}/move`, {
      ...form({ direction: "up" }),
      cookie,
    });
    expect(await titles()).toEqual(["First", "Third", "Second"]);
    await fetchApp(`/items/${first?.id}/move`, {
      ...form({ direction: "down" }),
      cookie,
    });
    expect(await titles()).toEqual(["Third", "First", "Second"]);
  });

  it("heals legacy equal and sparse positions when moving", async () => {
    const { user, cookie } = await ownerSetup();
    const listId = seq++;
    await db.insert(schema.lists).values({
      id: listId,
      userId: user.id,
      name: "Legacy",
      slug: `legacyslug${String(listId).padStart(12, "0")}`,
      createdAt: now,
      updatedAt: now,
    });
    const mk = async (title: string, position: number) => {
      const id = seq++;
      await db.insert(schema.items).values({
        id,
        listId,
        title,
        position,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    };
    // Equal positions — order falls back to id.
    const a = await mk("EqA", 0);
    await mk("EqB", 0);
    const cId = await mk("EqC", 0);
    await fetchApp(`/items/${cId}/move`, {
      ...form({ direction: "up" }),
      cookie,
    });
    const titles = async () =>
      (
        await db
          .select()
          .from(schema.items)
          .where(eq(schema.items.listId, listId))
          .orderBy(schema.items.position, schema.items.id)
      ).map((i) => i.title);
    expect(await titles()).toEqual(["EqA", "EqC", "EqB"]);
    // Positions are now normalized 0..n-1.
    const rows = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, listId))
      .orderBy(schema.items.position);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    // Sparse positions heal too.
    await db
      .update(schema.items)
      .set({ position: 10 })
      .where(eq(schema.items.id, a));
    await fetchApp(`/items/${a}/move`, {
      ...form({ direction: "up" }),
      cookie,
    });
    expect(await titles()).toEqual(["EqC", "EqA", "EqB"]);
  });

  it("deleting a list cascades to items and kills the public page", async () => {
    const { cookie } = await ownerSetup();
    const id = await createList(cookie);
    await fetchApp(`/lists/${id}/items`, {
      ...form({ input: "A thing" }),
      cookie,
    });
    const list = await db.query.lists.findFirst({
      where: eq(schema.lists.id, id),
    });
    await fetchApp(`/lists/${id}/delete`, { ...form({}), cookie });
    expect(
      await db.query.lists.findFirst({ where: eq(schema.lists.id, id) }),
    ).toBeUndefined();
    expect(
      await db.select().from(schema.items).where(eq(schema.items.listId, id)),
    ).toHaveLength(0);
    const pub = await fetchApp(`/l/${list?.slug}`);
    expect(pub.status).toBe(404);
  });

  it("owner edits show on the public page immediately", async () => {
    const { cookie } = await ownerSetup();
    const id = await createList(cookie, "Visible list");
    await fetchApp(`/lists/${id}/items`, {
      ...form({ input: "Shiny kettle" }),
      cookie,
    });
    const list = await db.query.lists.findFirst({
      where: eq(schema.lists.id, id),
    });
    const pub = await fetchApp(`/l/${list?.slug}`);
    expect(pub.status).toBe(200);
    expect(await pub.text()).toContain("Shiny kettle");
  });

  it("app_meta is gone", async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta'",
    ).all();
    expect(rows.results).toHaveLength(0);
  });
});
