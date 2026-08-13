import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createDb, schema } from "../db";
import { newSessionId } from "./slug";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 90;
const RENEW_BELOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionUser = typeof schema.users.$inferSelect;

type OwnerEnv = {
  Bindings: CloudflareBindings;
  Variables: { user: SessionUser };
};

export async function createSession<E extends { Bindings: CloudflareBindings }>(
  c: Context<E>,
  userId: number,
): Promise<void> {
  const db = createDb(c.env.DB);
  const id = newSessionId();
  const now = new Date();
  await db.insert(schema.sessions).values({
    id,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
  });
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: (SESSION_DAYS * DAY_MS) / 1000,
  });
}

export async function destroySession<
  E extends { Bindings: CloudflareBindings },
>(c: Context<E>): Promise<void> {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) {
    const db = createDb(c.env.DB);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function currentUser<E extends { Bindings: CloudflareBindings }>(
  c: Context<E>,
): Promise<SessionUser | null> {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const db = createDb(c.env.DB);
  const [row] = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, id));
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    // Lazy cleanup of the expired session.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }
  if (row.session.expiresAt.getTime() - now < RENEW_BELOW_DAYS * DAY_MS) {
    // Sliding renewal — the browser cookie must slide with the D1 row.
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(now + SESSION_DAYS * DAY_MS) })
      .where(eq(schema.sessions.id, id));
    setCookie(c, SESSION_COOKIE, id, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: (SESSION_DAYS * DAY_MS) / 1000,
    });
  }
  return row.user;
}

// Owner routes: attach the user or redirect to /login.
export const requireOwner: MiddlewareHandler<OwnerEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) return c.redirect("/login");
  c.set("user", user);
  await next();
};

// CSRF protection on top of SameSite=Lax: every POST must carry positive
// evidence of same-origin — a matching Origin header or
// Sec-Fetch-Site: same-origin. Browsers always send Origin on POST;
// scripts/tests must set one explicitly.
export const rejectCrossSite: MiddlewareHandler<{
  Bindings: CloudflareBindings;
}> = async (c, next) => {
  if (c.req.method === "POST") {
    const sameOrigin =
      c.req.header("Origin") === new URL(c.req.url).origin ||
      c.req.header("Sec-Fetch-Site") === "same-origin";
    if (!sameOrigin) {
      return c.text("Cross-site request rejected", 403);
    }
  }
  await next();
};
