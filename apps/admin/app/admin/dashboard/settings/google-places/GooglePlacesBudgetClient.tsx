"use client";

import { useMemo, useState } from "react";
import type { GoogleBudgetSummary, GooglePlacesBudgetSettings } from "@/lib/aws/location-intelligence-api";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7);

type ControlsSnapshot = {
  jobs: Array<{ job_key: string; daily_paid_call_limit: number; priority: string; enabled: boolean; notes?: string | null }>;
  usageByJobToday: Array<{ jobKey: string; calls: number; paidCalls: number; blocked: number; cacheHits: number; estimatedUnitSpendUsd: number }>;
  alerts: Array<{ billing_month: string; threshold_pct: number; spend_usd: number; credits_remaining_usd: number; operating_mode: string; email_sent: boolean; created_at: string }>;
};

type Props = {
  initialSettings: GooglePlacesBudgetSettings;
  initialSummary: GoogleBudgetSummary | null;
  initialControls: ControlsSnapshot | null;
};

function NumberField({ label, value, onChange, help }: { label: string; value: number; onChange: (value: number) => void; help: string }) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-black/20 p-4">
      <span className="text-sm font-black text-white">{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="mt-3 w-full rounded-xl border border-white/15 bg-[#0b0807] px-4 py-3 text-lg font-black text-white outline-none focus:border-rose-400"
      />
      <span className="mt-2 block text-xs leading-5 text-white/55">{help}</span>
    </label>
  );
}

export default function GooglePlacesBudgetClient({ initialSettings, initialSummary, initialControls }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [summary, setSummary] = useState(initialSummary);
  const [controls, setControls] = useState(initialControls);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const validation = useMemo(() => {
    if (settings.targetUsd > settings.softCapUsd) return "Target must be at or below the soft cap.";
    if (settings.softCapUsd > settings.hardCapUsd) return "Soft cap must be at or below the hard cap.";
    return null;
  }, [settings]);

  async function save() {
    if (validation) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings/google-places-budget", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to save Google budget settings.");
      if (payload?.settings) setSettings(payload.settings);
      if (payload?.summary) setSummary(payload.summary);
      if (payload?.controls) setControls(payload.controls);
      setMessage("Google Places budget controls saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Google budget settings.");
    } finally {
      setSaving(false);
    }
  }

  const fallbackOpeningSpend = settings.openingSpendMonth === currentMonth() ? settings.openingSpendUsd : 0;
  const spend = summary?.estimatedSpendUsd ?? fallbackOpeningSpend;
  const remaining = summary?.budgetRemainingUsd ?? Math.max(0, settings.hardCapUsd - spend);
  const creditsRemaining = summary?.estimatedCreditsRemainingUsd ?? Math.max(0, settings.creditBalanceUsd - spend);
  const percent = summary?.percentOfHardCapUsed ?? (settings.hardCapUsd > 0 ? Math.round((spend / settings.hardCapUsd) * 1000) / 10 : 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-rose-400/25 bg-[#170c0a] p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Current month spend</p>
          <p className="mt-3 text-3xl font-black text-white">{money.format(spend)}</p>
          <p className="mt-1 text-xs text-white/55">TheOutHaven metered estimate</p>
        </div>
        <div className="rounded-3xl border border-emerald-300/20 bg-[#0d1510] p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Budget left</p>
          <p className="mt-3 text-3xl font-black text-white">{money.format(remaining)}</p>
          <p className="mt-1 text-xs text-white/55">Against the hard monthly cap</p>
        </div>
        <div className="rounded-3xl border border-amber-300/20 bg-[#171207] p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">Credits left</p>
          <p className="mt-3 text-3xl font-black text-white">{money.format(creditsRemaining)}</p>
          <p className="mt-1 text-xs text-white/55">Estimated from the configured credit balance</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#110d0b] p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Budget used</p>
          <p className="mt-3 text-3xl font-black text-white">{percent.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-white/55">Mode: {summary?.operatingMode?.replaceAll("_", " ") || "starting"}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Google Places budget</p>
            <h2 className="mt-2 text-2xl font-black text-white">Monthly Controls</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Change the Google monthly operating budget without touching code. Location Intelligence uses these limits for optional import and refresh work. User-facing address autocomplete remains tracked separately in the same spend dashboard.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold text-white">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            />
            Paid Google work enabled
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <NumberField label="Target" value={settings.targetUsd} onChange={(targetUsd) => setSettings((current) => ({ ...current, targetUsd }))} help="Normal operating target before low-priority refreshes are reduced." />
          <NumberField label="Soft cap" value={settings.softCapUsd} onChange={(softCapUsd) => setSettings((current) => ({ ...current, softCapUsd }))} help="Above this point, only higher-priority paid work should continue." />
          <NumberField label="Hard cap" value={settings.hardCapUsd} onChange={(hardCapUsd) => setSettings((current) => ({ ...current, hardCapUsd }))} help="Optional paid Location Intelligence work stops here." />
          <NumberField label="Google credits" value={settings.creditBalanceUsd} onChange={(creditBalanceUsd) => setSettings((current) => ({ ...current, creditBalanceUsd }))} help="Used to estimate remaining promotional credits in this dashboard." />
          <NumberField label="Protected credit reserve" value={settings.minimumCreditReserveUsd} onChange={(minimumCreditReserveUsd) => setSettings((current) => ({ ...current, minimumCreditReserveUsd }))} help="Optional paid Google calls stop when estimated promotional credit reaches this reserve." />
          <NumberField
            label="Opening spend"
            value={settings.openingSpendMonth === currentMonth() ? settings.openingSpendUsd : 0}
            onChange={(openingSpendUsd) => setSettings((current) => ({ ...current, openingSpendUsd, openingSpendMonth: currentMonth() }))}
            help="Optional month-to-date spend from before AWS metering started. It automatically expires when the billing month changes."
          />
        </div>

        {validation ? <p className="mt-4 text-sm font-bold text-amber-300">{validation}</p> : null}
        {message ? <p className="mt-4 text-sm font-bold text-white/75">{message}</p> : null}
        <button
          type="button"
          onClick={save}
          disabled={saving || Boolean(validation)}
          className="mt-5 rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Google Budget"}
        </button>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Cost controls</p>
        <h2 className="mt-2 text-2xl font-black text-white">Paid calls by job today</h2>
        <p className="mt-2 text-sm text-white/60">Each background workload has its own daily paid-call ceiling. IDs-only lookups and cache hits do not consume the paid-call quota.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-white/45"><tr><th className="pb-3 pr-5">Job</th><th className="pb-3 pr-5">Priority</th><th className="pb-3 pr-5">Paid / limit</th><th className="pb-3 pr-5">Blocked</th><th className="pb-3">Cache hits</th></tr></thead>
            <tbody>{(controls?.jobs || []).map((job) => { const usage = controls?.usageByJobToday?.find((row) => row.jobKey === job.job_key); return (
              <tr key={job.job_key} className="border-t border-white/10"><td className="py-4 pr-5 font-bold text-white">{job.job_key}</td><td className="py-4 pr-5 text-white/65">{job.priority}</td><td className="py-4 pr-5 text-white/80">{usage?.paidCalls || 0} / {job.daily_paid_call_limit}</td><td className="py-4 pr-5 text-white/70">{usage?.blocked || 0}</td><td className="py-4 text-white/70">{usage?.cacheHits || 0}</td></tr>
            ); })}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">This month</p>
            <h2 className="mt-2 text-2xl font-black text-white">Google Usage</h2>
          </div>
          <p className="text-right text-xs text-white/50">Pricing snapshot {summary?.pricingSnapshot || "2026-09-01"}</p>
        </div>
        {summary?.usage?.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-white/45">
                <tr>
                  <th className="pb-3 pr-5">Usage</th>
                  <th className="pb-3 pr-5">Requests</th>
                  <th className="pb-3 pr-5">Free cap</th>
                  <th className="pb-3 pr-5">Billable</th>
                  <th className="pb-3 text-right">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.usage.map((item) => (
                  <tr key={item.sku} className="border-t border-white/10">
                    <td className="py-4 pr-5 font-bold text-white">{item.label}</td>
                    <td className="py-4 pr-5 text-white/75">{integer.format(item.requests)}</td>
                    <td className="py-4 pr-5 text-white/60">{item.freeCap == null ? "Unlimited" : integer.format(item.freeCap)}</td>
                    <td className="py-4 pr-5 text-white/75">{integer.format(item.billableRequests)}</td>
                    <td className="py-4 text-right font-black text-white">{money.format(item.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            AWS usage metering will appear here after the Location Intelligence API is deployed. Existing Google billing remains visible in Google Cloud during the cutover.
          </p>
        )}
        <p className="mt-5 text-xs leading-5 text-white/45">
          Google Cloud Billing is the final billing authority. TheOutHaven tracks requests centrally in AWS so imports, rich Details, five-photo profiles, and address autocomplete are visible in one operating budget.
        </p>
      </section>
    </div>
  );
}
