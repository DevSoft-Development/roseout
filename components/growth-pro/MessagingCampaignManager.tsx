"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  locationId: string;
  locationName: string;
  context: Record<string, string>;
  demoMode: boolean;
};

const field =
  "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-rose-400/60";
const button =
  "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black uppercase tracking-wide text-white/75 hover:bg-white/10";
const primary =
  "rounded-xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-4 py-2 text-sm font-black text-white disabled:opacity-50";

function qs(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}

export default function MessagingCampaignManager({
  locationId,
  locationName,
  context,
  demoMode,
}: Props) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    channel: "email",
    subject: "",
    body: "",
  });
  const apiContext = useMemo(() => ({ ...context, locationId }), [context, locationId]);

  async function load() {
    const res = await fetch(`/api/business/messaging/campaigns?${qs(apiContext)}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setCampaigns(json.campaigns || []);
    else setMessage(json.message || "Campaigns could not be loaded.");
  }

  useEffect(() => {
    void load();
  }, [locationId]);

  async function call(method: string, payload: Record<string, any>) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/business/messaging/campaigns", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...apiContext, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      setMessage(json.message || (res.ok ? "Campaign updated." : "Campaign action failed."));
      if (res.ok) await load();
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    const ok = await call("POST", draft);
    if (ok) setDraft({ name: "", channel: "email", subject: "", body: "" });
  }

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-[2rem] border border-white/10 bg-[#10131a] p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Messaging</p>
          <h1 className="mt-2 text-3xl font-black">{locationName}</h1>
          <p className="mt-2 text-sm font-bold text-white/50">
            Create campaign drafts, review content, and move campaigns through approval states.
          </p>
          {demoMode ? (
            <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">
              Demo mode is simulation-only: recipient count stays at zero, scheduling/sending is blocked, SMS credits stay at zero, and approval states are safe simulations.
            </p>
          ) : null}
        </header>

        {message ? <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/75">{message}</div> : null}

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <h2 className="text-xl font-black">New campaign draft</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <input className={field} placeholder="Campaign name" value={draft.name} onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))} />
            <select className={field} value={draft.channel} onChange={(e) => setDraft((v) => ({ ...v, channel: e.target.value }))}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
            <input className={field} placeholder="Email subject" disabled={draft.channel !== "email"} value={draft.subject} onChange={(e) => setDraft((v) => ({ ...v, subject: e.target.value }))} />
            <textarea className={`${field} min-h-28 lg:col-span-2`} placeholder="Campaign message" value={draft.body} onChange={(e) => setDraft((v) => ({ ...v, body: e.target.value }))} />
          </div>
          <button className={`${primary} mt-4`} disabled={busy || !draft.name.trim() || !draft.body.trim()} onClick={createDraft}>Save draft</button>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">{campaign.channel}</p>
                  <h2 className="mt-1 text-xl font-black">{campaign.name || "Campaign"}</h2>
                  <p className="mt-1 text-xs text-white/45">Status: {campaign.status || "draft"} · Recipients: {campaign.recipient_count ?? 0}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black text-white/60">{campaign.requires_admin_approval ? "Approval required" : "Standard"}</span>
              </div>
              {campaign.subject ? <p className="mt-4 text-sm font-black text-white/80">{campaign.subject}</p> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">{campaign.body_rendered || "No message body"}</p>
              {campaign.rejected_reason ? <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs font-bold text-rose-100">{campaign.rejected_reason}</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "request_approval" })}>Request approval</button>
                <button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "approve" })}>Approve</button>
                <button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "reject", reason: "Needs revision" })}>Reject</button>
                <button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "return_to_draft" })}>Return to draft</button>
                <button className={button} disabled={busy} onClick={() => call("DELETE", { campaignId: campaign.id })}>Delete</button>
              </div>
              {demoMode ? <p className="mt-4 text-xs font-bold text-amber-100/80">This demo campaign cannot schedule, send, or consume SMS credits.</p> : null}
            </article>
          ))}
          {!campaigns.length ? <div className="rounded-[2rem] border border-dashed border-white/15 p-8 text-sm font-bold text-white/40">No campaigns yet.</div> : null}
        </section>
      </div>
    </main>
  );
}
