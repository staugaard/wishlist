// Bindings wrangler's typegen can't know about: secrets (never in
// wrangler.jsonc) and the test-only OTP seam (set only in vitest.config.ts).
interface CloudflareBindings {
  RESEND_API_KEY?: string;
  DEV_EXPOSE_OTP?: string;
}
