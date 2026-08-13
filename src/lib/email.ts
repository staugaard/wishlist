// Login-code email via the Cloudflare Email Service binding — no API keys,
// no external vendor. Requires season4.app onboarded to Email Sending;
// family members' addresses are verified destinations, so sends are free
// on any plan. In dev builds the code is logged instead of sent.
const FROM = { email: "hinted@season4.app", name: "Hinted" };

export async function sendLoginCode(
  env: CloudflareBindings,
  email: string,
  code: string,
): Promise<void> {
  if (import.meta.env.DEV) {
    console.log(`[dev] Sign-in code for ${email}: ${code}`);
    return;
  }
  if (!env.EMAIL) {
    console.error("EMAIL binding is missing; cannot send login codes");
    return;
  }
  try {
    await env.EMAIL.send({
      to: email,
      from: FROM,
      subject: `Your Hinted sign-in code: ${code}`,
      text: `Your sign-in code is ${code}\n\nIt works for the next 10 minutes. If you didn't ask for it, you can ignore this email.`,
    });
  } catch (err) {
    console.error(
      `Email send failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
