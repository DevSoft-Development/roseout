import Link from "next/link";
import { PublicLeadForm } from "./PublicGrowthProForms";

export default function PublicGrowthProPage({ locationId, type, mode }: { locationId: string; type: string; mode: string }) {
  const base = `/locations/${type}/${locationId}`;
  const forms: Record<string, { endpoint: string; action: string; button: string; title: string }> = {
    offers: { endpoint: "/api/offers/demo/claim", action: "offer_claim", button: "Claim offer", title: "Claim a TheOutHaven offer" },
    vip: { endpoint: "/api/vip/signup", action: "vip_signup", button: "Join VIP list", title: "Join the VIP list" },
    events: { endpoint: "/api/location-leads", action: "event_lead", button: "Request event info", title: "Request a private event or group package" },
    feedback: { endpoint: "/api/feedback", action: "private_feedback", button: "Send private feedback", title: "Send private feedback" },
    "check-in": { endpoint: "/api/feedback", action: "guest_check_in", button: "Check in", title: "Check in at this location" },
  };
  const form = forms[mode];
  return <main className="min-h-screen bg-[#090607] px-4 py-10 text-white"><div className="mx-auto max-w-4xl"><Link href={base} className="text-sm font-black text-rose-200">← Location profile</Link><p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-rose-200">TheOutHaven Growth Pro</p><h1 className="mt-3 text-4xl font-black">{form?.title || "Menu, Packages & Pricing"}</h1><p className="mt-3 text-white/60">Premium business growth tools are available here without raw JSON or Google review flows.</p>{mode === "menu" || mode === "reserve" ? <div className="mt-6 grid gap-4 sm:grid-cols-2"><Link className="rounded-3xl border border-white/10 bg-white/[0.04] p-5" href={`${base}/offers`}>Claim an offer</Link><Link className="rounded-3xl border border-white/10 bg-white/[0.04] p-5" href={`${base}/events`}>Request a group event</Link></div> : form ? <PublicLeadForm locationId={locationId} {...form}/> : null}</div></main>;
}
