import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "../db";
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
    const db = createDb(env.DB);
    const now = new Date();

    if (meta.title && meta.title !== hostPlaceholder) {
      await db
        .update(schema.items)
        .set({ title: meta.title, updatedAt: now })
        .where(
          and(
            eq(schema.items.id, itemId),
            eq(schema.items.title, hostPlaceholder),
          ),
        );
    }
    if (meta.price) {
      await db
        .update(schema.items)
        .set({ price: meta.price, updatedAt: now })
        .where(and(eq(schema.items.id, itemId), isNull(schema.items.price)));
    }
    if (meta.imageUrl) {
      // Only bother storing if the slot is still open.
      const current = await db.query.items.findFirst({
        where: eq(schema.items.id, itemId),
      });
      if (current && current.imageKey == null) {
        const key = await storeItemImage(env, itemId, meta.imageUrl, fetcher);
        if (key) {
          await db
            .update(schema.items)
            .set({ imageKey: key, imageUrl: meta.imageUrl, updatedAt: now })
            .where(
              and(eq(schema.items.id, itemId), isNull(schema.items.imageKey)),
            );
        }
      }
    }
  } catch (err) {
    console.error(
      `Enrichment failed for item ${itemId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
