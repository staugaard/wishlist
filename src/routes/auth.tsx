import { and, eq, gt, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, schema } from "../db";
import { sha256Hex, timingSafeEqualHex } from "../lib/crypto";
import { sendLoginCode } from "../lib/email";
import { createSession, currentUser, destroySession } from "../lib/session";
import { LoginPage, VerifyFailedPage, VerifyPage } from "../pages/login";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_S = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const MAX_EMAIL_LEN = 254;

export const auth = new Hono<{ Bindings: CloudflareBindings }>();

function formStr(form: FormData, key: string, max: number): string {
  return String(form.get(key) ?? "")
    .trim()
    .slice(0, max);
}

auth.get("/login", async (c) => {
  if (await currentUser(c)) return c.redirect("/");
  return c.render(<LoginPage />, { title: "Sign in · Hinted" });
});

auth.post("/login", async (c) => {
  const form = await c.req.formData();
  const email = formStr(form, "email", MAX_EMAIL_LEN).toLowerCase();
  if (!email) return c.redirect("/login");

  const db = createDb(c.env.DB);
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  let devCode: string | undefined;

  if (user) {
    const now = new Date();
    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000,
    ).padStart(6, "0");
    const codeHash = await sha256Hex(`${email}:${code}`);
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    // One atomic conditional write decides eligibility AND mutates — no
    // read-then-write race can exceed the send cap or reset a live
    // window's budget. Timestamps are unix seconds in SQLite.
    // A live row only updates when the cooldown has passed and send
    // budget remains (carrying attempts/sends forward); an expired row
    // resets. No row returned = nothing sent.
    const written = await db
      .insert(schema.otpCodes)
      .values({
        email,
        codeHash,
        attempts: 0,
        sends: 1,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.otpCodes.email,
        set: {
          codeHash: sql`excluded.code_hash`,
          createdAt: sql`excluded.created_at`,
          expiresAt: sql`excluded.expires_at`,
          attempts: sql`CASE WHEN ${schema.otpCodes.expiresAt} > excluded.created_at THEN ${schema.otpCodes.attempts} ELSE 0 END`,
          sends: sql`CASE WHEN ${schema.otpCodes.expiresAt} > excluded.created_at THEN ${schema.otpCodes.sends} + 1 ELSE 1 END`,
        },
        setWhere: sql`${schema.otpCodes.expiresAt} <= excluded.created_at OR (excluded.created_at - ${schema.otpCodes.createdAt} >= ${RESEND_COOLDOWN_S} AND ${schema.otpCodes.sends} < ${MAX_SENDS_PER_WINDOW})`,
      })
      .returning();
    if (written.length > 0) {
      // Send out-of-band: response latency shouldn't reveal whether an
      // address is on the family list.
      c.executionCtx.waitUntil(sendLoginCode(c.env, email, code));
      // Test seam: statically compiled out of production builds.
      if (import.meta.env.DEV && c.env.DEV_EXPOSE_OTP === "1") devCode = code;
    }
  }

  // Identical response whether or not the email exists — no enumeration.
  if (devCode) c.header("X-Dev-Otp", devCode);
  return c.render(<VerifyPage email={email} />, { title: "Sign in · Hinted" });
});

auth.post("/login/verify", async (c) => {
  const form = await c.req.formData();
  const email = formStr(form, "email", MAX_EMAIL_LEN).toLowerCase();
  const code = formStr(form, "code", 6);

  const db = createDb(c.env.DB);
  const fail = () => {
    c.status(400);
    return c.render(<VerifyFailedPage email={email} />, {
      title: "Sign in · Hinted",
    });
  };
  if (!/^\d{6}$/.test(code)) return fail();

  // Atomically claim an attempt: only rows that are unexpired and under the
  // attempt cap are updated, so concurrent guesses each burn budget and
  // none can read a stale counter.
  const claimed = await db
    .update(schema.otpCodes)
    .set({ attempts: sql`${schema.otpCodes.attempts} + 1` })
    .where(
      and(
        eq(schema.otpCodes.email, email),
        gt(schema.otpCodes.expiresAt, new Date()),
        lt(schema.otpCodes.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  const row = claimed[0];
  if (!row) {
    // Missing, expired, or exhausted — tidy up whatever is there.
    await db
      .delete(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.email, email),
          lt(schema.otpCodes.expiresAt, new Date()),
        ),
      );
    return fail();
  }

  const expected = await sha256Hex(`${email}:${code}`);
  if (!timingSafeEqualHex(expected, row.codeHash)) return fail();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (!user) return fail();

  // Single-use under concurrency: only the request that actually deletes
  // the row (matching the hash it verified) may create a session.
  const consumed = await db
    .delete(schema.otpCodes)
    .where(
      and(
        eq(schema.otpCodes.email, email),
        eq(schema.otpCodes.codeHash, row.codeHash),
      ),
    )
    .returning();
  if (consumed.length === 0) return fail();

  await createSession(c, user.id);
  return c.redirect("/");
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.redirect("/");
});
