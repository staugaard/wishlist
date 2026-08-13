// Bindings wrangler's typegen can't know about: the test-only OTP seam
// (set only in vitest.config.ts).
interface CloudflareBindings {
  DEV_EXPOSE_OTP?: string;
}

// Injected by Vite at build time (vite.config.ts). Absent under the test
// runner's separate build — code must typeof-guard it.
declare const __BUILD_ID__: string;
