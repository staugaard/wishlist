import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Construct once per request (D1 sessions must not be shared across
// requests; module-scope state is not guaranteed to persist between
// isolate invocations anyway).
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

// Roll a list's cache validator. Strictly monotonic even within one second
// (D1 timestamps are second-granular): a touch always produces a new
// validator, so the edge-cached giver page can never wedge on a stale key.
export function touchListQuery(db: Db, listId: number) {
  return db
    .update(schema.lists)
    .set({
      updatedAt: sql`MAX(unixepoch(), ${schema.lists.updatedAt} + 1)`,
    })
    .where(eq(schema.lists.id, listId));
}

export async function touchList(db: Db, listId: number): Promise<void> {
  await touchListQuery(db, listId);
}

export { schema };
