import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Db, schema, touchListQuery } from "../db";
import { enrichItem } from "../lib/enrich";
import { deleteItemImages } from "../lib/images";
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
  const enriching = c.req.query("new") === "1";
  const shareUrl = `${new URL(c.req.url).origin}/l/${list.slug}`;
  return c.render(
    <EditorPage
      user={user}
      allLists={allLists}
      list={list}
      listItems={listItems}
      openItemId={openItemId}
      enriching={enriching}
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
  // Content write and validator touch are one transaction: a half-applied
  // pair could leave the edge cache stale for its full TTL.
  await db.batch([
    db
      .update(schema.lists)
      .set({
        name,
        occasionLabel: formStr(form, "occasionLabel", 80) || null,
        intro: formStr(form, "intro", 500) || null,
      })
      .where(eq(schema.lists.id, list.id)),
    touchListQuery(db, list.id),
  ]);
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
  const doomedItems = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.listId, list.id));
  await db.delete(schema.lists).where(eq(schema.lists.id, list.id));
  c.executionCtx.waitUntil(
    Promise.all(doomedItems.map((i) => deleteItemImages(c.env, i.id))).then(
      () => {},
    ),
  );
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
  const hostPlaceholder = href ? new URL(href).hostname : input;
  const [insertRows] = await db.batch([
    db
      .insert(schema.items)
      .values({
        listId: list.id,
        title: hostPlaceholder,
        url: href ?? null,
        position: maxPos + 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.items.id }),
    touchListQuery(db, list.id),
  ]);
  const created = insertRows[0];
  if (href && created) {
    // The magic paste: the row is already real; metadata settles in behind
    // the response (fill-if-untouched — see src/lib/enrich.ts).
    c.executionCtx.waitUntil(
      enrichItem(c.env, created.id, href, hostPlaceholder),
    );
    return c.redirect(`/lists/${list.id}?item=${created.id}&new=1`);
  }
  return c.redirect(`/lists/${list.id}?item=${created?.id}`);
});

// One segment, whole-segment regex param: Hono cannot mix :param{...} with
// a literal suffix, so the ".json" lives inside the pattern.
owner.get("/items/:file{[0-9]+\\.json}", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const item = await ownedItem(
    db,
    user.id,
    Number.parseInt(c.req.param("file"), 10),
  );
  if (!item) return c.notFound();
  return c.json({
    title: item.title,
    note: item.note,
    price: item.price,
    url: item.url,
    imageKey: item.imageKey,
  });
});

owner.post("/items/:id", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const item = await ownedItem(db, user.id, Number(c.req.param("id")));
  if (!item) return c.notFound();
  const form = await c.req.formData();
  const title = formStr(form, "title", 200);
  const price = formStr(form, "price", 100);
  // Only write enrichable fields the owner actually changed: a Done click
  // that races background enrichment must not resurrect the stale SSR
  // values it was rendered with (initialTitle/initialPrice hidden fields).
  const changes: Partial<typeof schema.items.$inferInsert> = {
    note: formStr(form, "note", 1000) || null,
    url: formStr(form, "url", 2048) || null,
    priority: form.get("priority") === "on",
    updatedAt: new Date(),
  };
  // Forms rendered before the baseline fields existed fall back to
  // always-write (legacy semantics).
  const hasBaseline = form.has("initialTitle");
  if (title && (!hasBaseline || title !== formStr(form, "initialTitle", 200))) {
    changes.title = title;
  }
  if (!hasBaseline || price !== formStr(form, "initialPrice", 100)) {
    changes.price = price || null;
  }
  await db.batch([
    db.update(schema.items).set(changes).where(eq(schema.items.id, item.id)),
    touchListQuery(db, item.listId),
  ]);
  return c.redirect(`/lists/${item.listId}`);
});

owner.post("/items/:id/delete", async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DB);
  const item = await ownedItem(db, user.id, Number(c.req.param("id")));
  if (!item) return c.notFound();
  await db.batch([
    db.delete(schema.items).where(eq(schema.items.id, item.id)),
    touchListQuery(db, item.listId),
  ]);
  c.executionCtx.waitUntil(deleteItemImages(c.env, item.id));
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
      if (first)
        await db.batch([first, ...rest, touchListQuery(db, item.listId)]);
    }
  }
  return c.redirect(`/lists/${item.listId}`);
});
