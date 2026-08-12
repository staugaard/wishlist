import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    // The TEST_MIGRATIONS binding is injected only in vitest.config.ts,
    // so it isn't part of the wrangler-generated bindings.
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
