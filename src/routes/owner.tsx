import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema } from "../db";
import { requireOwner, type SessionUser } from "../lib/session";
import { newSlug } from "../lib/slug";
import { safeHttpUrl } from "../lib/url";
import {
  ConfirmDeletePage,
  EditorPage,
  ListSettingsPage,
  NewListPage,
} from "../pages/owner";

function formStr(form: FormData, key: string, max: number): string {
  return String(form.get(key) ?? "")
    .trim()
    .slice(0, max);
}

type OwnerEnv = {
  Bindings: CloudflareBindings;
  Variables: { user: SessionUser };
};

export const owner = new Hono<OwnerEnv>();

// Scoped, not `use(requireOwner)` bare: a sub-app's `*` middleware would
// intercept every path in the parent app once mounted.
// ⚠ Every route prefix this sub-app serves MUST be listed here FIRST —
// a route outside these prefixes ships unauthenticated.
const OWNER_PREFIXES = ["/lists", "/lists/*", "/items/*"] as const;
for (const prefix of OWNER_PREFIXES) {
  owner.use(prefix, requireOwner);
}

async function ownedList(db: Db, userId: number, listId: number) {
  if (!Number.isInteger(listId)) return undefined;
  return db.query.lists.findFirst({
    where: and(eq(schema.lists.id, listId), eq(schema.lists.userId, userId)),
  });
}

async function ownedItem(db: Db, userId: number, itemId: number) {
  if (!Number.isInteger(itemId)) return undefined;
  const [row] = await db
    .select({ item: schema.items })
    .from(schema.items)
    .innerJoin(schema.lists, eq(schema.items.listId, schema.lists.id))
    .where(and(eq(schema.items.id, itemId), eq(schema.lists.userId, userId)));
  return row?.item;
}

owner.get("/lists/new", (c) => {
  return c.render(<NewListPage user={c.get("user")} />, {
    title: "New list · Hinted",
  });
});

owner.post("/lists", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const form = await c.req.formData();
  const name = formStr(form, "name", 120);
  if (!name) return c.redirect("/lists/new");
  const now = new Date();
  const [agg] = await db
    .select({
      maxPos: sql<number>`coalesce(max(${schema.lists.position}), -1)`,
    })
    .from(schema.lists)
    .where(eq(schema.lists.userId, user.id));
  const maxPos = agg?.maxPos ?? -1;
  const [created] = await db
    .insert(schema.lists)
    .values({
      userId: user.id,
      name,
      slug: newSlug(),
      position: maxPos + 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.lists.id });
  return c.redirect(`/lists/${created?.id}`);
});

owner.get("/lists/:id", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const list = await ownedList(db, user.id, Number(c.req.param("id")));
  if (!list) return c.notFound();
  const [allLists, listItems] = await Promise.all([
    db
      .select({ id: schema.lists.id, name: schema.lists.name })
      .from(schema.lists)
      .where(eq(schema.lists.userId, user.id))
      .orderBy(asc(schema.lists.position), asc(schema.lists.id)),
    db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, list.id))
      .orderBy(asc(schema.items.position), asc(schema.items.id)),
  ]);
  const openItemId = c.req.query("item")
    ? Number(c.req.query("item"))
    : undefined;
  const shareUrl = `${new URL(c.req.url).origin}/l/${list.slug}`;
  return c.render(
    <EditorPage
      user={user}
      allLists={allLists}
      list={list}
      listItems={listItems}
      openItemId={openItemId}
      shareUrl={shareUrl}
    />,
    { title: `${list.name} · Hinted` },
  );
});

owner.get("/lists/:id/settings", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const list = await ownedList(db, user.id, Number(c.req.param("id")));
  if (!list) return c.notFound();
  return c.render(<ListSettingsPage user={user} list={list} />, {
    title: `${list.name} · Hinted`,
  });
});

owner.post("/lists/:id", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const list = await ownedList(db, user.id, Number(c.req.param("id")));
  if (!list) return c.notFound();
  const form = await c.req.formData();
  const name = formStr(form, "name", 120);
  if (!name) return c.redirect(`/lists/${list.id}/settings`);
  await db
    .update(schema.lists)
    .set({
      name,
      occasionLabel: formStr(form, "occasionLabel", 80) || null,
      intro: formStr(form, "intro", 500) || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.lists.id, list.id));
  return c.redirect(`/lists/${list.id}`);
});

owner.get("/lists/:id/delete", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const list = await ownedList(db, user.id, Number(c.req.param("id")));
  if (!list) return c.notFound();
  const [counted] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.items)
    .where(eq(schema.items.listId, list.id));
  const count = counted?.count ?? 0;
  return c.render(
    <ConfirmDeletePage user={user} list={list} itemCount={count} />,
    {
      title: `Delete ${list.name} · Hinted`,
    },
  );
});

owner.post("/lists/:id/delete", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const list = await ownedList(db, user.id, Number(c.req.param("id")));
  if (!list) return c.notFound();
  await db.delete(schema.lists).where(eq(schema.lists.id, list.id));
  return c.redirect("/");
});

owner.post("/lists/:id/items", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const list = await ownedList(db, user.id, Number(c.req.param("id")));
  if (!list) return c.notFound();
  const form = await c.req.formData();
  const input = formStr(form, "input", 2048);
  if (!input) return c.redirect(`/lists/${list.id}`);
  // A pasted URL becomes a linked item titled by its host (Phase 3 turns
  // this into the auto-fill moment); anything else is a hand-typed item.
  const href = safeHttpUrl(input);
  const now = new Date();
  const [agg] = await db
    .select({
      maxPos: sql<number>`coalesce(max(${schema.items.position}), -1)`,
    })
    .from(schema.items)
    .where(eq(schema.items.listId, list.id));
  const maxPos = agg?.maxPos ?? -1;
  const [created] = await db
    .insert(schema.items)
    .values({
      listId: list.id,
      title: href ? new URL(href).hostname : input,
      url: href ?? null,
      position: maxPos + 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.items.id });
  return c.redirect(`/lists/${list.id}?item=${created?.id}`);
});

owner.post("/items/:id", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const item = await ownedItem(db, user.id, Number(c.req.param("id")));
  if (!item) return c.notFound();
  const form = await c.req.formData();
  const title = formStr(form, "title", 200);
  await db
    .update(schema.items)
    .set({
      title: title || item.title,
      note: formStr(form, "note", 1000) || null,
      price: formStr(form, "price", 100) || null,
      url: formStr(form, "url", 2048) || null,
      priority: form.get("priority") === "on",
      updatedAt: new Date(),
    })
    .where(eq(schema.items.id, item.id));
  return c.redirect(`/lists/${item.listId}`);
});

owner.post("/items/:id/delete", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const item = await ownedItem(db, user.id, Number(c.req.param("id")));
  if (!item) return c.notFound();
  await db.delete(schema.items).where(eq(schema.items.id, item.id));
  return c.redirect(`/lists/${item.listId}`);
});

owner.post("/items/:id/move", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const item = await ownedItem(db, user.id, Number(c.req.param("id")));
  if (!item) return c.notFound();
  const form = await c.req.formData();
  const direction = String(form.get("direction"));
  const siblings = await db
    .select({ id: schema.items.id, position: schema.items.position })
    .from(schema.items)
    .where(eq(schema.items.listId, item.listId))
    .orderBy(asc(schema.items.position), asc(schema.items.id));
  const idx = siblings.findIndex((s) => s.id === item.id);
  const target =
    direction === "up" ? idx - 1 : direction === "down" ? idx + 1 : -1;
  if (idx !== -1 && target >= 0 && target < siblings.length) {
    // Swap in the ordered array, then renormalize every position to its
    // index — heals legacy equal/sparse positions instead of corrupting them.
    // Known-benign race: two concurrent moves from stale snapshots can
    // leave duplicate positions; the next move renormalizes them away.
    const order = [...siblings];
    const a = order[idx];
    const b = order[target];
    if (a && b) {
      order[idx] = b;
      order[target] = a;
      const writes = order
        .map((row, i) => ({ row, i }))
        .filter(({ row, i }) => row.position !== i)
        .map(({ row, i }) =>
          db
            .update(schema.items)
            .set({ position: i })
            .where(eq(schema.items.id, row.id)),
        );
      const [first, ...rest] = writes;
      if (first) await db.batch([first, ...rest]);
    }
  }
  return c.redirect(`/lists/${item.listId}`);
});
