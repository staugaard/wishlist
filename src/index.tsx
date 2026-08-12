import { Hono } from "hono";
import { createDb, schema } from "./db";
import { renderer } from "./renderer";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use(renderer);

app.get("/", (c) => {
  return c.render(
    <main>
      <h1>Wishlist</h1>
      <p>Scaffolding in place. No product features yet — by design.</p>
    </main>,
  );
});

// Proves the full loop: migration applied → D1 binding → Drizzle write → read.
app.get("/healthz", async (c) => {
  const db = createDb(c.env.DB);
  const now = new Date();
  await db
    .insert(schema.appMeta)
    .values({ key: "heartbeat", value: "ok", updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appMeta.key,
      set: { updatedAt: now },
    });
  const row = await db.query.appMeta.findFirst();
  return c.json({
    status: "ok",
    db: row ? "ok" : "empty",
    heartbeat: row?.updatedAt.toISOString() ?? null,
  });
});

export default app;
