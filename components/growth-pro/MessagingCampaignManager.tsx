"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BusinessStatusBadge,
} from "@/components/business/BusinessDesignSystem";

type Props = {
  locationId: string;
  locationName: string;
  context: Record<string, string>;
  demoMode: boolean;
};

const field =
  "w-full rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-3 py-2.5 text-sm font-bold text-[var(--business-text)] outline-none transition placeholder:text-[var(--business-muted)] focus:border-rose-400/60";
const button =
  "rounded-xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--business-soft)] transition hover:border-[#ff2142]/35 hover:text-[var(--business-text)] disabled:opacity-50";
const primary =
  "rounded-xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-4 py-2 text-sm font-black text-white shadow-lg shadow-black/10 disabled:opacity-50";

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
  const [estimatedRecipients, setEstimatedRecipients] = useState<number | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [audience, setAudience] = useState({ birthdayMonth: "", source: "", interests: "" });
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

  function audienceFilter() {
    const interests = audience.interests.split(",").map((value) => value.trim()).filter(Boolean);
    return {
      ...(audience.birthdayMonth ? { birthdayMonth: audience.birthdayMonth } : {}),
      ...(audience.source ? { source: audience.source } : {}),
      ...(interests.length ? { interests } : {}),
    };
  }

  async function createDraft() {
    const ok = await call("POST", { ...draft, audienceFilter: audienceFilter() });
    if (ok) {
      setDraft({ name: "", channel: "email", subject: "", body: "" });
      setAudience({ birthdayMonth: "", source: "", interests: "" });
      setEstimatedRecipients(null);
    }
  }

  async function estimate(campaignId: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/business/messaging/campaigns", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...apiContext, campaignId, action: "estimate_audience", audienceFilter: audienceFilter() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(json.message || "Audience estimate failed.");
      else {
        setEstimatedRecipients(Number(json.recipient_count || 0));
        setMessage("Audience estimate refreshed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function launch(campaignId: string, action: "send_now" | "schedule") {
    const ok = await call("PATCH", {
      campaignId,
      action,
      audienceFilter: audienceFilter(),
      ...(action === "schedule" ? { scheduledFor } : {}),
    });
    if (ok) {
      setScheduledFor("");
      setEstimatedRecipients(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ff6b86]">Campaign workspace</p>
            <h2 className="mt-1 text-xl font-black">{locationName}</h2>
          </div>
          <BusinessStatusBadge tone={demoMode ? "amber" : "blue"}>
            {demoMode ? "Simulation only" : `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
          </BusinessStatusBadge>
        </div>
        {demoMode ? (
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-200">
            Demo mode is simulation-only: recipient count stays at zero, scheduling and sending are blocked, SMS credits stay at zero, and approval states are safe simulations.
          </p>
        ) : null}
      </section>

      {message ? (
        <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] px-4 py-3 text-sm font-bold text-[var(--business-soft)]">
          {message}
        </div>
      ) : null}

      <section className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5 sm:p-6">
        <h2 className="text-xl font-black">New campaign draft</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">
          Draft email or SMS, choose a consented audience, estimate reach, then send now or schedule delivery.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <input className={field} placeholder="Campaign name" value={draft.name} onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))} />
          <select className={field} value={draft.channel} onChange={(e) => setDraft((v) => ({ ...v, channel: e.target.value }))}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <input className={field} placeholder="Email subject" disabled={draft.channel !== "email"} value={draft.subject} onChange={(e) => setDraft((v) => ({ ...v, subject: e.target.value }))} />
          <textarea className={`${field} min-h-28 lg:col-span-2`} placeholder="Campaign message" value={draft.body} onChange={(e) => setDraft((v) => ({ ...v, body: e.target.value }))} />
          <select className={field} value={audience.birthdayMonth} onChange={(e) => setAudience((v) => ({ ...v, birthdayMonth: e.target.value }))}>
            <option value="">All birthday months</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((month) => <option key={month} value={month}>Birthday month {month}</option>)}
          </select>
          <input className={field} placeholder="Signup source (optional)" value={audience.source} onChange={(e) => setAudience((v) => ({ ...v, source: e.target.value }))} />
          <input className={`${field} lg:col-span-2`} placeholder="Interests, comma-separated (optional)" value={audience.interests} onChange={(e) => setAudience((v) => ({ ...v, interests: e.target.value }))} />
        </div>
        <button className={`${primary} mt-4`} disabled={busy || !draft.name.trim() || !draft.body.trim()} onClick={createDraft}>
          Save draft
        </button>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">{campaign.channel}</p>
                <h2 className="mt-1 text-xl font-black">{campaign.name || "Campaign"}</h2>
                <p className="mt-1 text-xs font-semibold text-[var(--business-muted)]">
                  Status: {campaign.status || "draft"} · Recipients: {campaign.recipient_count ?? 0}{campaign.scheduled_for ? ` · Scheduled ${new Date(campaign.scheduled_for).toLocaleString()}` : ""}
                </p>
              </div>
              <BusinessStatusBadge tone={campaign.requires_admin_approval ? "amber" : "muted"}>
                {campaign.requires_admin_approval ? "Approval required" : "Standard"}
              </BusinessStatusBadge>
            </div>
            {campaign.subject ? <p className="mt-4 text-sm font-black text-[var(--business-text)]">{campaign.subject}</p> : null}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--business-soft)]">{campaign.body_rendered || "No message body"}</p>
            {campaign.metadata?.delivery_summary ? <p className="mt-3 text-xs font-bold text-[var(--business-muted)]">Delivery: {campaign.metadata.delivery_summary.sent || 0} sent · {campaign.metadata.delivery_summary.failed || 0} failed · {campaign.metadata.delivery_summary.skipped || 0} skipped</p> : null}
            {campaign.rejected_reason ? (
              <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs font-bold text-rose-200">{campaign.rejected_reason}</p>
            ) : null}
            <div className="mt-5 rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label className="text-xs font-black uppercase tracking-wide text-[var(--business-muted)]">Schedule time
                  <input type="datetime-local" className={`${field} mt-2`} value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                </label>
                <div className="text-right text-xs font-black text-[var(--business-muted)]">{estimatedRecipients == null ? "Reach not estimated" : `${estimatedRecipients.toLocaleString()} eligible recipient${estimatedRecipients === 1 ? "" : "s"}`}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={button} disabled={busy} onClick={() => estimate(campaign.id)}>Estimate audience</button>
                {campaign.channel === "sms" && !campaign.approved_at ? <button className={button} disabled={busy || campaign.status === "pending_approval"} onClick={() => call("PATCH", { campaignId: campaign.id, action: "request_approval" })}>{campaign.status === "pending_approval" ? "Approval requested" : "Request SMS approval"}</button> : null}
                {(!campaign.requires_admin_approval || campaign.approved_at) && !["sent","sending","cancelled"].includes(campaign.status) ? <button className={primary} disabled={busy} onClick={() => launch(campaign.id, "send_now")}>Send now</button> : null}
                {(!campaign.requires_admin_approval || campaign.approved_at) && !["sent","sending","cancelled"].includes(campaign.status) ? <button className={button} disabled={busy || !scheduledFor} onClick={() => launch(campaign.id, "schedule")}>Schedule</button> : null}
                {!["sent","sending","scheduled","cancelled"].includes(campaign.status) ? <button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "return_to_draft" })}>Return to draft</button> : null}
                {["scheduled","pending_approval","approved","draft"].includes(campaign.status) ? <button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "cancel" })}>Cancel</button> : null}
                {campaign.status === "draft" ? <button className={button} disabled={busy} onClick={() => call("DELETE", { campaignId: campaign.id })}>Delete</button> : null}
                {demoMode ? <><button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "approve" })}>Simulate approve</button><button className={button} disabled={busy} onClick={() => call("PATCH", { campaignId: campaign.id, action: "reject", reason: "Needs revision" })}>Simulate reject</button></> : null}
              </div>
            </div>
            {demoMode ? <p className="mt-4 text-xs font-bold text-amber-200">This demo campaign cannot schedule, send, or consume SMS credits.</p> : null}
          </article>
        ))}
        {!campaigns.length ? (
          <div className="rounded-[2rem] border border-dashed border-[var(--business-border)] bg-[var(--business-panel)] p-8 text-sm font-bold text-[var(--business-muted)]">
            No campaigns yet.
          </div>
        ) : null}
      </section>
    </div>
  );
}
