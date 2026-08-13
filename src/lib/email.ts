// Login-code email via Resend (raw fetch, no SDK). Until the custom domain
// lands (Phase 5), Resend's onboarding sender can only deliver to the
// account owner's own address. Without a key (local dev, tests) the code is
// logged instead of sent.
export async function sendLoginCode(
  env: CloudflareBindings,
  email: string,
  code: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (import.meta.env.DEV) {
      console.log(`[dev] Sign-in code for ${email}: ${code}`);
    } else {
      // Never log codes in production — a missing secret is an ops error.
      console.error("RESEND_API_KEY is not set; cannot send login codes");
    }
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Hinted <onboarding@resend.dev>",
      to: [email],
      subject: `Your Hinted sign-in code: ${code}`,
      text: `Your sign-in code is ${code}\n\nIt works for the next 10 minutes. If you didn't ask for it, you can ignore this email.`,
    }),
  });
  if (!res.ok) {
    console.error(`Resend send failed (${res.status}): ${await res.text()}`);
  }
}
