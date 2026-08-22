import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicLeadForm } from "./PublicGrowthProForms";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";
import { getInternalDemoViewer } from "@/lib/demo/internal-demo-access";

export default async function PublicGrowthProPage({
  locationId,
  type,
  mode,
}: {
  locationId: string;
  type: string;
  mode: string;
}) {
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,demo_key,is_demo,is_hidden,is_searchable")
    .eq("id", locationId)
    .maybeSingle();

  if (!location?.id) notFound();

  const isDemo =
    location.demo_key === MIRROR_DEMO_KEY || location.is_demo === true;
  if (isDemo) {
    const safeFixture =
      location.demo_key === MIRROR_DEMO_KEY &&
      location.is_demo === true &&
      location.is_hidden === true &&
      location.is_searchable !== true;
    const allowSafeReserveFixture = safeFixture && mode === "reserve";
    const viewer = !allowSafeReserveFixture && safeFixture ? await getInternalDemoViewer() : null;
    if (!allowSafeReserveFixture && !viewer) notFound();
  }

  const base = `/locations/${type}/${locationId}`;
  let activeOffer: any = null;
  if (mode === "offers") {
    const { data } = await supabaseAdmin
      .from("location_offers")
      .select("id,title,description,offer_type,start_date,end_date,redemption_instructions")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    activeOffer = data || null;
  }

  const forms: Record<
    string,
    { endpoint: string; action: string; button: string; title: string }
  > = {
    offers: {
      endpoint: activeOffer?.id ? `/api/offers/${activeOffer.id}/claim` : "",
      action: "offer_claim",
      button: "Claim offer",
      title: activeOffer?.title || "Claim a TheOutHaven offer",
    },
    vip: {
      endpoint: "/api/vip/signup",
      action: "vip_signup",
      button: "Join VIP list",
      title: "Join the VIP list",
    },
    events: {
      endpoint: "/api/location-leads",
      action: "event_lead",
      button: "Request event info",
      title: "Request a private event or group package",
    },
    feedback: {
      endpoint: "/api/feedback",
      action: "private_feedback",
      button: "Send private feedback",
      title: "Send private feedback",
    },
    "check-in": {
      endpoint: "/api/feedback",
      action: "guest_check_in",
      button: "Check in",
      title: "Check in at this location",
    },
  };
  const form = forms[mode];

  return (
    <main className="min-h-screen bg-[#090607] px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href={base} className="text-sm font-black text-rose-200">
          ← Location profile
        </Link>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-rose-200">
          TheOutHaven Growth Pro
        </p>
        <h1 className="mt-3 text-4xl font-black">
          {form?.title || "Menu, Packages & Pricing"}
        </h1>
        <p className="mt-3 text-white/60">
          Premium business growth tools are available here without raw JSON or Google review flows.
        </p>

        {mode === "offers" && activeOffer ? (
          <div className="mt-5 rounded-3xl border border-rose-300/20 bg-rose-500/10 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">
              Active offer
            </p>
            <h2 className="mt-2 text-2xl font-black">{activeOffer.title}</h2>
            {activeOffer.description ? (
              <p className="mt-2 text-sm leading-6 text-white/65">
                {activeOffer.description}
              </p>
            ) : null}
            {activeOffer.redemption_instructions ? (
              <p className="mt-3 text-xs font-bold text-white/50">
                {activeOffer.redemption_instructions}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "offers" && !activeOffer ? (
          <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm font-bold text-white/55">
            No active offers are available for this location yet.
          </div>
        ) : mode === "menu" || mode === "reserve" ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Link
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
              href={`${base}/offers`}
            >
              Claim an offer
            </Link>
            <Link
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
              href={`${base}/events`}
            >
              Request a group event
            </Link>
          </div>
        ) : form ? (
          <PublicLeadForm locationId={locationId} {...form} />
        ) : null}
      </div>
    </main>
  );
}
