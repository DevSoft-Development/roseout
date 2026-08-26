import { supabaseAdmin } from "@/lib/supabase-admin";
import AttendanceConfirm from "./AttendanceConfirm";

function stopFrom(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const name = String(row.name || row.restaurant_name || row.activity_name || "").trim();
  if (!name) return null;
  const detail = [row.address, row.city, row.state].map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  return { name, detail: detail || null };
}

export default async function ConfirmOutingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: outing } = await supabaseAdmin
    .from("outings")
    .select("id,plan_title,status,metadata,confirm_token_expires_at,attendance_confirmed_at,attendance_declined_at")
    .eq("confirm_token", token)
    .maybeSingle();

  const expired = outing?.confirm_token_expires_at && new Date(outing.confirm_token_expires_at).getTime() < Date.now();
  if (!outing || expired || (outing.status === "cancelled" && !outing.attendance_declined_at)) {
    return <main className="min-h-screen bg-[#12070a] px-6 py-12 text-white"><section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8"><h1 className="text-3xl font-black">Follow-up link unavailable</h1><p className="mt-3 text-white/65">This outing follow-up link is invalid or expired.</p></section></main>;
  }

  const selected = outing.metadata && typeof outing.metadata === "object" ? (outing.metadata as Record<string, any>).selected_locations : null;
  const stops = [stopFrom(selected?.restaurant), stopFrom(selected?.activity)].filter(Boolean) as Array<{ name: string; detail: string | null }>;

  let existingReviewUrl: string | null = null;
  if (outing.attendance_confirmed_at) {
    const { data: eligibility } = await supabaseAdmin
      .from("location_review_eligibility")
      .select("review_token,status")
      .eq("outing_id", outing.id)
      .eq("status", "eligible")
      .maybeSingle();
    if (eligibility?.review_token) existingReviewUrl = `/reviews/verified/${eligibility.review_token}`;
  }

  return <AttendanceConfirm token={token} title={outing.plan_title || "Your TheOutHaven outing"} stops={stops} existingReviewUrl={existingReviewUrl} />;
}
