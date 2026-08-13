// Bindings wrangler's typegen can't know about: the test-only OTP seam
// (set only in vitest.config.ts).
interface CloudflareBindings {
  DEV_EXPOSE_OTP?: string;
}
