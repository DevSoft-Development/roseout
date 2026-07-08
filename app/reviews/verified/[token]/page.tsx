import { supabaseAdmin } from "@/lib/supabase-admin";
import { VerifiedReviewForm } from "./VerifiedReviewForm";

export default async function VerifiedReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await supabaseAdmin
    .from("location_review_eligibility")
    .select("location_id,status,review_token_expires_at,locations:location_id(name,restaurant_name,activity_name)")
    .eq("review_token", token)
    .maybeSingle();
  const expired = data?.review_token_expires_at && new Date(data.review_token_expires_at).getTime() < Date.now();
  if (!data || data.status !== "eligible" || expired) {
    return <main className="min-h-screen bg-[#12070a] px-6 py-12 text-white"><section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8"><h1 className="text-3xl font-black">Review link unavailable</h1><p className="mt-3 text-white/70">This verified review link is invalid, expired, or already used.</p></section></main>;
  }
  const loc: any = Array.isArray(data.locations) ? data.locations[0] : data.locations;
  const name = loc?.name || loc?.restaurant_name || loc?.activity_name || "your outing";
  return (
    <main className="min-h-screen bg-[#12070a] px-6 py-12 text-white">
      <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-rose-200">Verified review</p>
        <h1 className="mt-4 text-4xl font-black">Share how everything went</h1>
        <p className="mt-3 text-white/70">Your review helps improve future TheOutHaven recommendations.</p>
        <p className="mt-3 text-sm text-white/50">For {name}</p>
        <VerifiedReviewForm token={token} locationId={data.location_id} />
      </section>
    </main>
  );
}
