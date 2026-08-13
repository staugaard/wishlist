import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema, touchListQuery } from "../db";
import { storeItemImage } from "./images";
import { fetchMetadata } from "./metadata";

// Background enrichment of a just-pasted item. Fill-if-untouched: every
// write is conditional on the field still being in its placeholder/empty
// state, so a fetch can never clobber something the owner typed while it
// was in flight. Runs inside waitUntil — must never throw.
export async function enrichItem(
  env: CloudflareBindings,
  itemId: number,
  url: string,
  hostPlaceholder: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  try {
    const meta = await fetchMetadata(url, fetcher);
    if (!meta.title && !meta.price && !meta.imageUrl) return;
    const db = createDb(env.DB);
    const now = new Date();
    const item = await db.query.items.findFirst({
      where: eq(schema.items.id, itemId),
    });
    if (!item) return;

    // Each fill-if-untouched write commits atomically with a validator
    // touch — a content change can never land without rolling the edge
    // cache key. The touch is unconditional (harmless when the write
    // matched nothing; the validator is monotonic).
    if (meta.title && meta.title !== hostPlaceholder) {
      await db.batch([
        db
          .update(schema.items)
          .set({ title: meta.title, updatedAt: now })
          .where(
            and(
              eq(schema.items.id, itemId),
              eq(schema.items.title, hostPlaceholder),
            ),
          ),
        touchListQuery(db, item.listId),
      ]);
    }
    if (meta.price) {
      await db.batch([
        db
          .update(schema.items)
          .set({ price: meta.price, updatedAt: now })
          .where(and(eq(schema.items.id, itemId), isNull(schema.items.price))),
        touchListQuery(db, item.listId),
      ]);
    }
    if (meta.imageUrl && item.imageKey == null) {
      const key = await storeItemImage(env, itemId, meta.imageUrl, fetcher);
      if (key) {
        await db.batch([
          db
            .update(schema.items)
            .set({ imageKey: key, imageUrl: meta.imageUrl, updatedAt: now })
            .where(
              and(eq(schema.items.id, itemId), isNull(schema.items.imageKey)),
            ),
          touchListQuery(db, item.listId),
        ]);
      }
    }
  } catch (err) {
    console.error(
      `Enrichment failed for item ${itemId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
