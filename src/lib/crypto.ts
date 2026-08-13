import { timingSafeEqual } from "node:crypto";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time comparison of two equal-length hex strings (Workers' node:crypto).
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}
