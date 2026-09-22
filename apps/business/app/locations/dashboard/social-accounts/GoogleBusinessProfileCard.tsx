"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, ExternalLink, MapPin, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

type Candidate = {
  accountName: string;
  accountDisplayName: string | null;
  locationName: string;
  title: string | null;
  placeId: string | null;
  storefrontAddress: Record<string, unknown> | null;
};

type Mismatch = {
  field: "title" | "phone" | "website" | "address" | "hours";
  localValue: unknown;
  googleValue: unknown;
  status: "different";
};

type Connection = {
  id: string;
  google_account_display_name: string | null;
  google_location_name: string | null;
  google_location_title: string | null;
  status: string;
  token_expires_at: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  health_score: number;
  mismatch_count: number;
  mismatches: Mismatch[];
  candidate_locations: Candidate[];
};

function pretty(value: unknown) {
  if (value == null || value === "") return "Not set";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(pretty).join(", ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.addressLines)) {
      return [...obj.addressLines.map(String), obj.locality, obj.administrativeArea, obj.postalCode].filter(Boolean).join(", ");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function fieldLabel(field: Mismatch["field"]) {
  return field === "title" ? "Business name" : field === "phone" ? "Phone" : field === "website" ? "Website" : field === "address" ? "Address" : "Hours";
}

export default function GoogleBusinessProfileCard({
  locationId,
  locationName,
  configured,
  connection,
}: {
  locationId: string;
  locationName: string;
  configured: boolean;
  connection: Connection | null;
}) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const connected = connection?.status === "connected" || connection?.status === "degraded";
  const mappingRequired = connection?.status === "mapping_required";
  const needsReauth = connection?.status === "reauthorization_required";
  const candidates = connection?.candidate_locations || [];
  const mismatches = connection?.mismatches || [];
  const returnPath = `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`;
  const connectHref = `/api/locations/google-business-profile/connect?locationId=${encodeURIComponent(locationId)}&returnTo=${encodeURIComponent(returnPath)}`;
  const healthTone = (connection?.health_score || 0) >= 85 ? "text-emerald-200" : (connection?.health_score || 0) >= 60 ? "text-amber-200" : "text-rose-200";

  async function post(path: string, payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, ...payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "The request could not be completed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request could not be completed.");
      setBusy("");
    }
  }

  const candidateOptions = useMemo(() => candidates.map((candidate) => ({
    value: candidate.locationName,
    label: [candidate.title || "Untitled Google location", candidate.accountDisplayName].filter(Boolean).join(" · "),
  })), [candidates]);

  return (
    <section className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-blue-300/20 bg-blue-500/10">
            <MapPin className="h-7 w-7 text-blue-200" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--business-muted)]">Local presence</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--business-text)]">Google Business Profile</h2>
            <p className="mt-2 text-sm font-bold text-[var(--business-muted)]">
              {connection?.google_location_title || (mappingRequired ? "Choose which Google location belongs to this business" : "Connect Search and Maps data for this location")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${connected ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : needsReauth ? "border-rose-300/20 bg-rose-500/10 text-rose-100" : "border-amber-300/20 bg-amber-500/10 text-amber-100"}`}>
            {connected ? "Connected" : needsReauth ? "Reconnect required" : mappingRequired ? "Mapping required" : "Not connected"}
          </span>
          {connection ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-[var(--business-muted)]">Health {connection.health_score || 0}%</span> : null}
        </div>
      </div>

      {message ? <div role="alert" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">{message}</div> : null}
      {connection?.last_error ? <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">{connection.last_error}</div> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Health" value={connection ? `${connection.health_score || 0}%` : "—"} valueClass={healthTone} />
        <Metric label="Mismatches" value={connection ? String(connection.mismatch_count || 0) : "—"} />
        <Metric label="Last sync" value={connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"} />
        <Metric label="Google account" value={connection?.google_account_display_name || "—"} />
      </div>

      {mappingRequired ? (
        <div className="mt-6 rounded-3xl border border-amber-300/15 bg-amber-500/[0.06] p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <div>
              <h3 className="font-black text-[var(--business-text)]">Select the matching Google location</h3>
              <p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">Google authorized {candidates.length} location{candidates.length === 1 ? "" : "s"}. Choose the profile that represents {locationName}.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select value={selected} onChange={(event) => setSelected(event.target.value)} className="min-h-12 flex-1 rounded-xl border border-[var(--business-border)] bg-[var(--business-panel)] px-4 text-sm font-bold text-[var(--business-text)]">
              <option value="">Choose a Google location…</option>
              {candidateOptions.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
            </select>
            <button disabled={!selected || busy === "map"} onClick={() => post("/api/locations/google-business-profile/map", { google_location_name: selected }, "map")} className="min-h-12 rounded-xl bg-white px-5 text-sm font-black text-black disabled:opacity-40">
              {busy === "map" ? "Mapping…" : "Use this location"}
            </button>
          </div>
        </div>
      ) : null}

      {connected && connection?.last_sync_at && mismatches.length ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-lg font-black text-[var(--business-text)]">Data differences</h3><p className="mt-1 text-sm font-semibold text-[var(--business-muted)]">Choose the source of truth one field at a time. TheOutHaven never overwrites Google automatically.</p></div>
          </div>
          <div className="mt-4 space-y-3">
            {mismatches.map((mismatch) => (
              <div key={mismatch.field} className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--business-muted)]">{fieldLabel(mismatch.field)}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <SourceValue label="TheOutHaven" value={pretty(mismatch.localValue)} />
                      <SourceValue label="Google" value={pretty(mismatch.googleValue)} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button disabled={Boolean(busy)} onClick={() => post("/api/locations/google-business-profile/sync", { action: "use_theouthaven", field: mismatch.field }, `push-${mismatch.field}`)} className="min-h-10 rounded-xl border border-[var(--business-border)] px-3 text-xs font-black text-[var(--business-text)] disabled:opacity-40">Use TheOutHaven</button>
                    <button disabled={Boolean(busy)} onClick={() => post("/api/locations/google-business-profile/sync", { action: "use_google", field: mismatch.field }, `pull-${mismatch.field}`)} className="min-h-10 rounded-xl bg-white px-3 text-xs font-black text-black disabled:opacity-40">Use Google</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : connected && connection?.last_sync_at ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.06] px-4 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-200" />
          <div><p className="text-sm font-black text-emerald-100">Google and TheOutHaven are aligned</p><p className="mt-1 text-xs font-semibold text-emerald-100/60">No tracked profile differences were found on the last sync.</p></div>
        </div>
      ) : connected ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-blue-300/15 bg-blue-500/[0.06] px-4 py-4">
          <RefreshCw className="h-5 w-5 text-blue-200" />
          <div><p className="text-sm font-black text-blue-100">Run the first profile health check</p><p className="mt-1 text-xs font-semibold text-blue-100/60">The Google location is mapped. Refresh health to compare business name, phone, website, address, and hours.</p></div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {configured ? (
          <a href={connectHref} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-black transition hover:bg-white/90">
            <ExternalLink className="h-4 w-4" />
            {connection ? "Reconnect Google" : "Connect Google Business Profile"}
          </a>
        ) : (
          <span className="inline-flex min-h-12 items-center rounded-xl border border-amber-300/20 bg-amber-500/10 px-5 text-sm font-black text-amber-100">Google OAuth credentials must be configured by TheOutHaven</span>
        )}
        {connected ? <button disabled={Boolean(busy)} onClick={() => post("/api/locations/google-business-profile/sync", { action: "refresh" }, "refresh")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--business-border)] px-5 text-sm font-black text-[var(--business-text)] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />Refresh health</button> : null}
        {connection ? <button disabled={Boolean(busy)} onClick={() => { if (window.confirm("Disconnect Google Business Profile from this location?")) void post("/api/locations/google-business-profile/sync", { action: "disconnect" }, "disconnect"); }} className="min-h-12 rounded-xl border border-rose-300/20 px-4 text-sm font-black text-rose-200 disabled:opacity-40">{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</button> : null}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Info icon={<ShieldCheck className="h-4 w-4 text-blue-200" />} title="Owner-controlled sync" body="TheOutHaven compares business facts and shows differences before changing either system. You choose which source wins." />
        <Info icon={<MapPin className="h-4 w-4 text-blue-200" />} title="Location-specific authorization" body={`This connection is scoped to ${locationName}. Other businesses cannot access or reuse its mapped Google profile.`} />
      </div>
    </section>
  );
}

function Metric({ label, value, valueClass = "text-[var(--business-text)]" }: { label: string; value: string; valueClass?: string }) {
  return <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">{label}</p><p className={`mt-2 truncate text-sm font-black ${valueClass}`}>{value}</p></div>;
}

function SourceValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-[var(--business-border)] bg-black/10 p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--business-muted)]">{label}</p><p className="mt-1 break-words text-xs font-bold text-[var(--business-text)]">{value}</p></div>;
}

function Info({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4"><div className="flex items-center gap-2 text-[var(--business-text)]">{icon}<p className="text-sm font-black">{title}</p></div><p className="mt-2 text-xs font-semibold leading-5 text-[var(--business-muted)]">{body}</p></div>;
}
