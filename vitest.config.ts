import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // Read Drizzle-generated SQL migrations so the test setup file can apply
  // them to each isolated D1 instance (tests do NOT share .wrangler/state
  // with the dev server).
  const migrations = await readD1Migrations("./drizzle");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // DEV_EXPOSE_OTP is the test-only auth seam — never set outside tests.
          bindings: { TEST_MIGRATIONS: migrations, DEV_EXPOSE_OTP: "1" },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
