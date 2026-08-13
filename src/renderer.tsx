import { html } from "hono/html";
import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script, ViteClient } from "vite-ssr-components/hono";

declare module "hono" {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: module augmentation requires an interface
    (
      content: string | Promise<string>,
      props?: { title?: string; description?: string },
    ): Response;
  }
}

// Applies a stored manual theme before first paint — no flash. Kept inline
// and tiny; "auto" (no stored value) simply leaves the media query in charge.
const themeScript = html`<script>
  try {
    var t = localStorage.getItem("hinted-theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (e) {}
</script>`;

export const renderer = jsxRenderer(({ children, title, description }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ?? "Hinted"}</title>
        {description ? <meta name="description" content={description} /> : null}
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#e8e0d1"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#211c15"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {themeScript}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/newsreader-var.woff2"
          crossorigin=""
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/hanken-grotesk-var.woff2"
          crossorigin=""
        />
        <Link href="/src/styles.css" rel="stylesheet" />
        <ViteClient />
        <Script src="/src/client.ts" />
      </head>
      <body>{children}</body>
    </html>
  );
});
