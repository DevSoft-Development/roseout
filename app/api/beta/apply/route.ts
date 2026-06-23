import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { sendRawBrandedEmail } from "@/lib/email";
import { buildSiteUrl } from "@/lib/site-url";
const SAFE = "We could not verify that submission. Please refresh and try again.";
function remoteIp(req: NextRequest) { return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null; }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim(); const email = String(body.email ?? "").trim().toLowerCase();
    if (!name || !email || !String(body.city ?? "").trim()) return NextResponse.json({ success: false, error: "Name, email, and city are required." }, { status: 400 });
    const turnstile = await verifyTurnstileToken({ token: body.turnstileToken ?? body["cf-turnstile-response"], remoteIp: remoteIp(request), expectedAction: "beta_apply", source: "beta_application", metadata: { email } });
    if (!turnstile.success) return NextResponse.json({ success: false, error: SAFE }, { status: 400 });
    const { error } = await supabaseAdmin.from("beta_applications").insert({ name, email, phone: body.phone || null, city: body.city || null, borough: body.borough || null, tester_type: body.tester_type || "user", device_type: body.device_type || null, testing_interests: Array.isArray(body.testing_interests) ? body.testing_interests : [], availability: body.availability || null, notes: body.notes || null, turnstile_verified: true, turnstile_action: turnstile.action ?? null, turnstile_hostname: turnstile.hostname ?? null });
    if (error) throw error;
    void sendRawBrandedEmail({ to: "admin@theouthaven.com", department: "support", subject: "New TheOutHaven beta application", heading: "New beta application", body: `${name} (${email}) applied to test as ${body.tester_type || "user"}.`, cta: { label: "Review Beta Applications", url: buildSiteUrl("/admin/dashboard/beta") } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("BETA_APPLY_ERROR", error);
    return NextResponse.json({ success: false, error: "We could not submit your application right now." }, { status: 500 });
  }
}
