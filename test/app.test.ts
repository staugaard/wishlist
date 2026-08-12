import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../src/db";

describe("integration (real workerd, real D1)", () => {
  it("serves the home page", async () => {
    const res = await exports.default.fetch("http://example.com/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Wishlist");
  });

  it("round-trips the database via /healthz", async () => {
    const res = await exports.default.fetch("http://example.com/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });
});

describe("db unit access", () => {
  it("reads and writes through Drizzle against the isolated D1", async () => {
    const db = createDb(env.DB);
    await db
      .insert(schema.appMeta)
      .values({ key: "test-key", value: "test-value", updatedAt: new Date() });
    const row = await db.query.appMeta.findFirst({
      where: eq(schema.appMeta.key, "test-key"),
    });
    expect(row?.key).toBe("test-key");
    expect(row?.value).toBe("test-value");
  });
});
