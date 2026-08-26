import { MapPin, ShieldCheck } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { VerifiedReviewForm } from "./VerifiedReviewForm";

export default async function VerifiedReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await supabaseAdmin
    .from("location_review_eligibility")
    .select("location_id,status,source,outing_id,reservation_id,review_token_expires_at,locations:location_id(name,restaurant_name,activity_name,address,city,state)")
    .eq("review_token", token)
    .maybeSingle();
  const expired = data?.review_token_expires_at && new Date(data.review_token_expires_at).getTime() < Date.now();
  if (!data || data.status !== "eligible" || expired) {
    return <main className="min-h-screen bg-[#12070a] px-6 py-12 text-white"><section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8"><h1 className="text-3xl font-black">Review link unavailable</h1><p className="mt-3 text-white/70">This verified review link is invalid, expired, or already used.</p></section></main>;
  }
  const loc: any = Array.isArray(data.locations) ? data.locations[0] : data.locations;
  const name = loc?.name || loc?.restaurant_name || loc?.activity_name || "your visit";
  const address = [loc?.address, loc?.city, loc?.state].filter(Boolean).join(", ");
  const verifiedLabel = data.source === "internal_reservation" ? "Attendance verified by TheOutHaven Reserve" : "Verified outing review";

  return (
    <main className="min-h-screen bg-[#12070a] px-4 py-8 text-white sm:px-6 sm:py-12">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.13),transparent_38%),rgba(255,255,255,0.04)] p-5 shadow-2xl shadow-black/25 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-black text-emerald-100">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5"><ShieldCheck className="h-4 w-4" /> {verifiedLabel}</span>
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">Share how everything went</h1>
        <p className="mt-3 leading-6 text-white/65">You’re reviewing a visit we can tie to your TheOutHaven outing or reservation. Your location feedback helps future recommendations, and your TheOutHaven feedback helps us improve the planning experience.</p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">You visited</p>
          <p className="mt-2 text-lg font-black text-white">{name}</p>
          {address ? <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white/45"><MapPin className="h-4 w-4 shrink-0" /> {address}</p> : null}
        </div>

        <VerifiedReviewForm token={token} locationId={data.location_id} locationName={name} />
      </section>
    </main>
  );
}
