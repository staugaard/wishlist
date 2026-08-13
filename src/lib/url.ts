// Returns the URL if it parses as http(s), otherwise undefined.
// Guards CTA hrefs against javascript:/data: and other schemes.
export function safeHttpUrl(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    // not a URL at all
  }
  return undefined;
}
