"use client";

import { useEffect, useState } from "react";

type Campaign = {
  id: string; name: string | null; status: string; body_rendered: string | null;
  recipient_count: number | null; location_name: string; location_city: string | null; location_state: string | null;
};

export default function BusinessSmsApprovalQueue() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/marketing/location-messaging", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setCampaigns(body.campaigns || []);
    else setMessage(body.error || "Business SMS approvals could not be loaded.");
  }

  useEffect(() => { void load(); }, []);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id); setMessage("");
    const response = await fetch("/api/admin/marketing/location-messaging", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action, reason: action === "reject" ? "Needs revision before SMS delivery." : null }),
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? (action === "approve" ? "Campaign approved." : "Campaign rejected.") : body.error || "Approval action failed.");
    setBusy(""); if (response.ok) await load();
  }

  const pending = campaigns.filter((campaign) => campaign.status === "pending_approval");
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Business messaging</p><h2 className="mt-1 text-xl font-black text-white">SMS campaign approvals</h2><p className="mt-1 text-sm text-white/50">Review owner-submitted SMS before it can be scheduled or sent.</p></div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/60">{pending.length} pending</span>
      </div>
      {message ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-white/70">{message}</div> : null}
      <div className="mt-4 space-y-3">
        {pending.length ? pending.map((campaign) => {
          const where = [campaign.location_name, [campaign.location_city, campaign.location_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
          return <article key={campaign.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="font-black text-white">{campaign.name || "SMS campaign"}</p><p className="mt-1 text-xs font-bold text-white/45">{where}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65">{campaign.body_rendered || "No message body"}</p></div><div className="flex shrink-0 gap-2"><button disabled={Boolean(busy)} onClick={() => decide(campaign.id, "reject")} className="rounded-xl border border-rose-300/20 px-3 py-2 text-xs font-black text-rose-200 disabled:opacity-40">Reject</button><button disabled={Boolean(busy)} onClick={() => decide(campaign.id, "approve")} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-black disabled:opacity-40">{busy === campaign.id ? "Working…" : "Approve"}</button></div></div></article>;
        }) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm font-semibold text-white/40">No business SMS campaigns are waiting for approval.</div>}
      </div>
    </section>
  );
}