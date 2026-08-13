import { jsxRenderer } from "hono/jsx-renderer";
import { Link, Script, ViteClient } from "vite-ssr-components/hono";

declare module "hono" {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: module augmentation requires an interface
    (content: string | Promise<string>, props?: { title?: string }): Response;
  }
}

export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ?? "Hinted"}</title>
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
