import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "./db";
import { HomePage } from "./pages/home";
import { GiverListPage, NotFoundPage } from "./pages/list";
import { renderer } from "./renderer";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use(renderer);

app.get("/", (c) => {
  return c.render(<HomePage />, { title: "Hinted" });
});

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
  const [owner, listItems] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, list.userId) }),
    db
      .select()
      .from(schema.items)
      .where(eq(schema.items.listId, list.id))
      .orderBy(asc(schema.items.position), asc(schema.items.id)),
  ]);
  if (!owner) {
    c.status(404);
    return c.render(<NotFoundPage />, { title: "Not found · Hinted" });
  }
  return c.render(
    <GiverListPage list={list} owner={owner} listItems={listItems} />,
    {
      title: `${list.name} · Hinted`,
    },
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
