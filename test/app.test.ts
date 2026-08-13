import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "../src/db";

const db = createDb(env.DB);
const now = new Date();

let nextId = 100;
async function makeList(opts: {
  ownerName?: string;
  items?: Array<Partial<typeof schema.items.$inferInsert> & { title: string }>;
  intro?: string | null;
}) {
  const userId = nextId++;
  const listId = nextId++;
  const slug = `testslug${String(listId).padStart(14, "0")}`;
  await db.insert(schema.users).values({
    id: userId,
    email: `owner${userId}@example.com`,
    name: opts.ownerName ?? "Sofie Demo",
    createdAt: now,
  });
  await db.insert(schema.lists).values({
    id: listId,
    userId,
    name: "Test list",
    intro: opts.intro ?? "A few things I'd love.",
    slug,
    createdAt: now,
    updatedAt: now,
  });
  for (const [i, item] of (opts.items ?? []).entries()) {
    await db.insert(schema.items).values({
      listId,
      position: i,
      createdAt: now,
      updatedAt: now,
      ...item,
    });
  }
  return { slug, listId, userId };
}

async function getPage(path: string) {
  const res = await exports.default.fetch(`http://example.com${path}`);
  return { res, html: await res.text() };
}

describe("public list page /l/:slug", () => {
  it("renders items in position order", async () => {
    const { slug } = await makeList({
      items: [
        { title: "Alpha thing", position: 0 },
        { title: "Bravo thing", position: 1 },
        { title: "Charlie thing", position: 2 },
      ],
    });
    const { res, html } = await getPage(`/l/${slug}`);
    expect(res.status).toBe(200);
    const order = ["Alpha thing", "Bravo thing", "Charlie thing"].map((t) =>
      html.indexOf(t),
    );
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("404s on an unknown slug", async () => {
    const { res, html } = await getPage("/l/doesnotexist0000000000");
    expect(res.status).toBe(404);
    // Hono JSX escapes apostrophes in text nodes.
    expect(html).toContain("This list isn&#39;t here.");
  });

  it("marks the page noindex", async () => {
    const { slug } = await makeList({ items: [{ title: "A thing" }] });
    const { res } = await getPage(`/l/${slug}`);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("renders note, price, priority and CTA only when present", async () => {
    const { slug } = await makeList({
      items: [
        { title: "Bare item" },
        {
          title: "Full item",
          note: "Size medium",
          price: "About 100 kr",
          url: "https://example.com/full",
          priority: true,
        },
      ],
    });
    const { html } = await getPage(`/l/${slug}`);
    expect(html).toContain("Size medium");
    expect(html).toContain("About 100 kr");
    expect(html).toContain("Really wants this");
    expect(html).toContain("https://example.com/full");
    // Only the full item has a CTA / note / stamp.
    expect(html.match(/See it in the shop/g)).toHaveLength(1);
    expect(html.match(/hn-note\b/g)).toHaveLength(1);
    expect(html.match(/hn-stamp\b/g)).toHaveLength(1);
  });

  it("photo-less cards render no photo slot at all", async () => {
    const { slug } = await makeList({
      items: [{ title: "Hammock" }],
    });
    const { html } = await getPage(`/l/${slug}`);
    expect(html).toContain("Hammock");
    expect(html).not.toContain("hn-photo--empty");
    expect(html).not.toContain("no photo");
  });

  it("escapes HTML in user content", async () => {
    const { slug } = await makeList({
      items: [{ title: '<script>alert("x")</script>', note: "<b>bold</b>" }],
    });
    const { html } = await getPage(`/l/${slug}`);
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>bold</b>");
  });

  it("refuses non-http(s) CTA urls", async () => {
    const { slug } = await makeList({
      items: [{ title: "Sneaky item", url: "javascript:alert(1)" }],
    });
    const { html } = await getPage(`/l/${slug}`);
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("See it in the shop");
  });

  it("shows the owner's first name in the bar and closing line", async () => {
    const { slug } = await makeList({
      ownerName: "Karen Andersen",
      items: [{ title: "A thing" }],
    });
    const { html } = await getPage(`/l/${slug}`);
    expect(html).toContain("Shared by Karen");
    expect(html).toContain("Karen keeps this list up to date.");
    expect(html).not.toContain("Andersen");
  });
});

describe("other routes", () => {
  it("healthz reports ok against the new schema", async () => {
    const res = await exports.default.fetch("http://example.com/healthz");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  it("home page renders the wordmark", async () => {
    const { res, html } = await getPage("/");
    expect(res.status).toBe(200);
    expect(html).toContain("hn-wordmark");
    expect(html).toContain("A place for family wishlists.");
  });
});
