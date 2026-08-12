import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Construct once per request (D1 sessions must not be shared across
// requests; module-scope state is not guaranteed to persist between
// isolate invocations anyway).
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
