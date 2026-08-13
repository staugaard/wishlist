import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { listCacheKey, matchCached, storeAndMark } from "./lib/pageCache";
import { currentUser, rejectCrossSite } from "./lib/session";
import { HomePage } from "./pages/home";
import { GiverListPage, NotFoundPage } from "./pages/list";
import { OwnerHomePage } from "./pages/owner";
import { renderer } from "./renderer";
import { auth } from "./routes/auth";
import { owner } from "./routes/owner";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use(renderer);
app.use(rejectCrossSite);

app.get("/", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.render(<HomePage />, { title: "Hinted" });
  const db = createDb(c.env.DB);
  const rows = await db
    .select({
      list: schema.lists,
      itemCount: sql<number>`(select count(*) from ${schema.items} where ${schema.items.listId} = ${schema.lists.id})`,
    })
    .from(schema.lists)
    .where(eq(schema.lists.userId, user.id))
    .orderBy(asc(schema.lists.position), asc(schema.lists.id));
  return c.render(
    <OwnerHomePage
      user={user}
      ownedLists={rows.map((r) => ({ list: r.list, itemCount: r.itemCount }))}
    />,
    {
      title: "Your lists · Hinted",
    },
  );
});

app.route("/", auth);
app.route("/", owner);

app.get("/l/:slug", async (c) => {
  // Public ≠ searchable.
  c.header("X-Robots-Tag", "noindex");

  const db = createDb(c.env.DB);
  const list = await db.query.lists.findFirst({
    where: eq(schema.lists.slug, c.req.param("slug")),
  });
  if (!list) {
    c.status(404);
    return c.render(<NotFoundPage />, { title: "Not found · Hinted" });
  }

  // One indexed row read decides both 404s and the cache key — the items
  // query and SSR render are what the edge cache skips.
  const key = listCacheKey(list.slug, list.updatedAt);
  const cached = await matchCached(key, "HIT");
  if (cached) {
    cached.headers.set("X-Robots-Tag", "noindex");
    return cached;
  }

  const [ownerRow, listItems] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, list.userId) }),
    db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, list.id))
      .orderBy(asc(schema.items.position), asc(schema.items.id)),
  ]);
  if (!ownerRow) {
    c.status(404);
    return c.render(<NotFoundPage />, { title: "Not found · Hinted" });
  }
  const res = await c.render(
    <GiverListPage list={list} owner={ownerRow} listItems={listItems} />,
    {
      title: `${list.name} · Hinted`,
      description:
        list.intro ?? `${ownerRow.name.split(" ")[0]} keeps a wishlist here.`,
    },
  );
  return storeAndMark(key, res, (p) => c.executionCtx.waitUntil(p));
});

// Our stored copy of a product photo. Public (giver pages embed these);
// keys are content-addressed so immutable caching is safe.
const IMG_KEY = /^items\/\d+\/[a-f0-9]{16}\.(jpeg|png|webp|gif|avif)$/;
app.get("/img/*", async (c) => {
  const key = c.req.path.slice("/img/".length);
  if (!IMG_KEY.test(key)) return c.notFound();
  const cacheKey = new Request(new URL(c.req.url).origin + c.req.path);
  const cached = await matchCached(cacheKey, "HIT");
  if (cached) {
    // Content-addressed: the browser may hold it forever.
    cached.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return cached;
  }
  const object = await c.env.IMAGES.get(key);
  if (!object) return c.notFound();
  const res = new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "X-Robots-Tag": "noindex",
    },
  });
  return storeAndMark(
    cacheKey,
    res,
    (p) => c.executionCtx.waitUntil(p),
    "public, max-age=31536000, immutable",
  );
});

// Proves the full loop: migrations → D1 binding → query.
app.get("/healthz", async (c) => {
  const db = createDb(c.env.DB);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.lists);
  return c.json({ status: "ok", db: "ok", lists: row?.count ?? 0 });
});

app.notFound((c) => {
  c.status(404);
  return c.render(<NotFoundPage />, { title: "Not found · Hinted" });
});

export default app;
