"use client";

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  MousePointerClick,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminKpiCard,
  AdminKpiGrid,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";

type ShortLink = {
  id: string;
  code: string;
  short_url: string;
  destination_url: string;
  link_type: string;
  entity_type: string | null;
  entity_id: string | null;
  campaign_id: string | null;
  title: string | null;
  is_active: boolean;
  expires_at: string | null;
  max_clicks: number | null;
  click_count: number;
  last_clicked_at: string | null;
  created_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ClickRow = {
  id: string;
  clicked_at: string;
  referrer: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

type LinkForm = {
  title: string;
  destination_url: string;
  code: string;
  link_type: string;
  entity_type: string;
  entity_id: string;
  campaign_id: string;
  expires_at: string;
  max_clicks: string;
};

const emptyForm: LinkForm = {
  title: "",
  destination_url: "",
  code: "",
  link_type: "generic",
  entity_type: "",
  entity_id: "",
  campaign_id: "",
  expires_at: "",
  max_clicks: "",
};

const LINK_TYPES = [
  ["generic", "General link"],
  ["outing", "Outing"],
  ["location", "Location"],
  ["claim", "Business claim"],
  ["event", "Event"],
  ["experience", "Experience"],
  ["reservation", "Reservation"],
  ["postcard", "Postcard"],
  ["campaign", "Campaign"],
] as const;

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function isExpired(link: ShortLink) {
  return Boolean(link.expires_at && new Date(link.expires_at).getTime() <= Date.now());
}

function isClickCapped(link: ShortLink) {
  return Boolean(link.max_clicks && link.click_count >= link.max_clicks);
}

function linkState(link: ShortLink) {
  if (!link.is_active) return { label: "Disabled", tone: "muted" as const };
  if (isExpired(link)) return { label: "Expired", tone: "amber" as const };
  if (isClickCapped(link)) return { label: "Click limit reached", tone: "amber" as const };
  return { label: "Active", tone: "green" as const };
}

function inputClass() {
  return "admin-field min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10";
}

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</span>
      <div className="mt-2">{children}</div>
      {helper ? <span className="mt-1 block text-xs leading-5 text-white/40">{helper}</span> : null}
    </label>
  );
}

function ActionButton({ label, onClick, icon, danger = false }: { label: string; onClick: () => void; icon: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${danger ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20" : "border-white/10 bg-white/[0.05] text-white/65 hover:border-white/20 hover:text-white"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function ShortLinksConsole() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [form, setForm] = useState<LinkForm>(emptyForm);
  const [editing, setEditing] = useState<ShortLink | null>(null);
  const [recentClicks, setRecentClicks] = useState<ClickRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "250" });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter === "active") params.set("active", "true");
      if (statusFilter === "inactive") params.set("active", "false");
      const response = await fetch(`/api/admin/short-links?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load short links.");
      setLinks(payload.links || []);
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "Unable to load short links." });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLinks(), 250);
    return () => window.clearTimeout(timer);
  }, [loadLinks]);

  const metrics = useMemo(() => {
    let active = 0;
    let clicked = 0;
    let totalClicks = 0;
    for (const link of links) {
      if (link.is_active && !isExpired(link) && !isClickCapped(link)) active += 1;
      if (link.click_count > 0) clicked += 1;
      totalClicks += Number(link.click_count || 0);
    }
    return { active, clicked, totalClicks, inactive: links.length - active };
  }, [links]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setRecentClicks([]);
  };

  const copy = async (link: ShortLink) => {
    await navigator.clipboard.writeText(link.short_url);
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 1600);
  };

  const openEditor = async (link: ShortLink) => {
    setEditing(link);
    setForm({
      title: link.title || "",
      destination_url: link.destination_url,
      code: link.code,
      link_type: link.link_type,
      entity_type: link.entity_type || "",
      entity_id: link.entity_id || "",
      campaign_id: link.campaign_id || "",
      expires_at: toLocalInputValue(link.expires_at),
      max_clicks: link.max_clicks ? String(link.max_clicks) : "",
    });
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/admin/short-links/${link.id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load link details.");
      setRecentClicks(payload.recent_clicks || []);
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "Unable to load link details." });
    } finally {
      setDetailsLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const body = {
        title: form.title || null,
        destination_url: form.destination_url,
        ...(editing ? {} : { code: form.code || undefined }),
        link_type: form.link_type,
        entity_type: form.entity_type || null,
        entity_id: form.entity_id || null,
        campaign_id: form.campaign_id || null,
        expires_at: form.expires_at || null,
        max_clicks: form.max_clicks || null,
      };
      const response = await fetch(editing ? `/api/admin/short-links/${editing.id}` : "/api/admin/short-links", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to save short link.");
      setNotice({ tone: "good", text: editing ? "Short link updated." : `Created ${payload.link.short_url}` });
      resetForm();
      await loadLinks();
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "Unable to save short link." });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (link: ShortLink) => {
    try {
      const response = await fetch(`/api/admin/short-links/${link.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: !link.is_active }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to update link.");
      setNotice({ tone: "good", text: `${link.short_url} ${payload.link.is_active ? "enabled" : "disabled"}.` });
      await loadLinks();
      if (editing?.id === link.id) setEditing(payload.link);
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "Unable to update link." });
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.35rem] border border-rose-300/15 bg-[radial-gradient(circle_at_top_right,rgba(236,11,91,0.16),transparent_36%),linear-gradient(145deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02))] p-5 shadow-xl shadow-black/20 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100"><Sparkles className="h-3.5 w-3.5" /> Branded short domain</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-black text-white/55">outhvn.com</span>
            </div>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">One short link system for the entire platform.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Use the same branded domain for outings, locations, claims, events, experiences, reservations, postcards, and campaigns. Change the destination later without replacing the printed or shared link.</p>
          </div>
          <button type="button" onClick={resetForm} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500">
            <Plus className="h-4 w-4" /> Create a link
          </button>
        </div>
      </section>

      {notice ? (
        <div role="status" className={`rounded-2xl border px-4 py-3 text-sm font-bold ${notice.tone === "good" ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-rose-300/25 bg-rose-500/10 text-rose-100"}`}>
          {notice.text}
        </div>
      ) : null}

      <AdminKpiGrid>
        <AdminKpiCard label="Links in view" value={links.length} helper="Matches your current filter" icon={Link2} />
        <AdminKpiCard label="Active" value={metrics.active} helper={`${metrics.inactive} inactive, expired, or capped`} icon={Power} />
        <AdminKpiCard label="Clicks" value={metrics.totalClicks} helper={`${metrics.clicked} links have activity`} icon={MousePointerClick} />
        <AdminKpiCard label="Domain" value="outhvn.com" helper="Secure branded redirects" icon={ExternalLink} />
      </AdminKpiGrid>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
        <AdminSectionCard className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Link library</p>
              <h2 className="mt-1 text-xl font-black text-white">Your branded links</h2>
              <p className="mt-1 text-sm text-white/45">Search, copy, open, edit, or pause any link.</p>
            </div>
            <button type="button" onClick={() => void loadLinks()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-black text-white/70 hover:text-white">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="admin-field flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-white focus-within:border-rose-300/50 focus-within:ring-4 focus-within:ring-rose-300/10">
              <Search className="h-4 w-4 shrink-0 text-white/35" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, short code, or destination" className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold outline-none placeholder:text-white/30" />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              {(["all", "active", "inactive"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-black capitalize transition ${statusFilter === value ? "border-rose-300/50 bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/20" : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20 hover:text-white"}`}>
                  {value === "inactive" ? "Paused / expired" : value}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center text-sm font-bold text-white/45">Loading your links…</div> : null}
            {!loading && !links.length ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                <Link2 className="mx-auto h-7 w-7 text-rose-200" />
                <h3 className="mt-3 font-black text-white">No links in this view</h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-white/45">Clear the filters or create your first branded link using the form on this page.</p>
              </div>
            ) : null}
            {!loading && links.map((link) => {
              const state = linkState(link);
              return (
                <article key={link.id} className={`rounded-2xl border p-4 transition ${editing?.id === link.id ? "border-rose-300/45 bg-rose-500/[0.06] shadow-lg shadow-rose-950/10" : "border-white/10 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]"}`}>
                  <div className="flex min-w-0 flex-col gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void copy(link)} className="max-w-full truncate text-left text-base font-black text-white hover:text-rose-100">{link.short_url}</button>
                        <AdminStatusBadge tone={state.tone}>{state.label}</AdminStatusBadge>
                        <AdminStatusBadge tone="muted">{LINK_TYPES.find(([value]) => value === link.link_type)?.[1] || link.link_type}</AdminStatusBadge>
                      </div>
                      <p className="mt-2 truncate text-sm font-bold text-white/65">{link.title || "Untitled link"}</p>
                      <p className="mt-1 truncate text-xs text-white/35">Destination: {link.destination_url}</p>
                    </div>

                    <div className="grid gap-2 text-xs font-semibold text-white/40 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2"><span className="block text-[10px] font-black uppercase tracking-wide text-white/30">Clicks</span><span className="mt-0.5 block text-sm font-black text-white/70">{link.click_count.toLocaleString()}</span></div>
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2"><span className="block text-[10px] font-black uppercase tracking-wide text-white/30">Last click</span><span className="mt-0.5 block truncate text-sm font-black text-white/70">{formatDate(link.last_clicked_at)}</span></div>
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2"><span className="block text-[10px] font-black uppercase tracking-wide text-white/30">Expires</span><span className="mt-0.5 block truncate text-sm font-black text-white/70">{link.expires_at ? formatDate(link.expires_at) : "No expiration"}</span></div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <ActionButton label={copiedId === link.id ? "Copied" : "Copy"} onClick={() => void copy(link)} icon={copiedId === link.id ? <Check className="h-4 w-4 text-emerald-200" /> : <Copy className="h-4 w-4" />} />
                      <a href={link.short_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-white/65 transition hover:border-white/20 hover:text-white"><ExternalLink className="h-4 w-4" /> Open</a>
                      <ActionButton label="Edit" onClick={() => void openEditor(link)} icon={<Pencil className="h-4 w-4" />} />
                      <ActionButton label={link.is_active ? "Pause" : "Enable"} onClick={() => void toggleActive(link)} icon={<Power className="h-4 w-4" />} danger={link.is_active} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </AdminSectionCard>

        <div className="space-y-6">
          <AdminSectionCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">{editing ? "Edit link" : "Quick create"}</p>
                <h2 className="mt-1 truncate text-xl font-black text-white">{editing ? editing.short_url : "Create a branded link"}</h2>
                <p className="mt-1 text-sm leading-6 text-white/45">{editing ? "Change where this link goes without changing the short URL people already have." : "Paste a destination and create. Everything else is optional."}</p>
              </div>
              {editing ? <ActionButton label="Close" onClick={resetForm} icon={<X className="h-4 w-4" />} /> : <span className="rounded-xl border border-rose-200/20 bg-rose-500/10 p-2 text-rose-100"><Plus className="h-5 w-5" /></span>}
            </div>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <Field label="Where should it go?" helper="Use any secure http or https page, including TheOutHaven pages.">
                <input required type="url" value={form.destination_url} onChange={(event) => setForm((current) => ({ ...current, destination_url: event.target.value }))} placeholder="https://theouthaven.com/..." className={inputClass()} />
              </Field>
              <Field label="Name this link" helper="Optional. This is only for your team and makes links easier to find later.">
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: Queens date night campaign" className={inputClass()} />
              </Field>

              {!editing ? (
                <div className="rounded-2xl border border-rose-300/15 bg-rose-500/[0.055] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Your link</p>
                  <p className="mt-2 truncate text-lg font-black text-white">outhvn.com/{form.code.trim() || "automatic-code"}</p>
                  <p className="mt-1 text-xs leading-5 text-white/40">A secure code is generated automatically unless you choose a custom one below.</p>
                </div>
              ) : null}

              <details key={editing?.id || "new-link"} open={editing ? true : undefined} className="group rounded-2xl border border-white/10 bg-white/[0.025]">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-black text-white/70 hover:text-white">
                  <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                  Advanced options
                  <span className="ml-auto text-xs font-semibold text-white/35">Optional</span>
                </summary>
                <div className="space-y-4 border-t border-white/10 p-4">
                  {!editing ? (
                    <Field label="Custom short code" helper="Optional. Leave blank to generate one automatically.">
                      <div className="admin-field flex min-h-11 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0d] focus-within:border-rose-300/50 focus-within:ring-4 focus-within:ring-rose-300/10">
                        <span className="flex items-center border-r border-white/10 px-3 text-sm font-black text-white/40">outhvn.com/</span>
                        <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="automatic" className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30" />
                      </div>
                    </Field>
                  ) : null}
                  <Field label="Link purpose">
                    <select value={form.link_type} onChange={(event) => setForm((current) => ({ ...current, link_type: event.target.value }))} className={inputClass()}>
                      {LINK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Associated record type" helper="Examples: location, event, claim."><input value={form.entity_type} onChange={(event) => setForm((current) => ({ ...current, entity_type: event.target.value }))} placeholder="Optional" className={inputClass()} /></Field>
                    <Field label="Associated record ID"><input value={form.entity_id} onChange={(event) => setForm((current) => ({ ...current, entity_id: event.target.value }))} placeholder="Optional" className={inputClass()} /></Field>
                  </div>
                  <Field label="Campaign ID" helper="Use this only when linking the short URL to an existing campaign record."><input value={form.campaign_id} onChange={(event) => setForm((current) => ({ ...current, campaign_id: event.target.value }))} placeholder="Optional campaign UUID" className={inputClass()} /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Expiration"><input type="datetime-local" value={form.expires_at} onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))} className={inputClass()} /></Field>
                    <Field label="Click limit" helper="Leave blank for unlimited."><input type="number" min="1" step="1" value={form.max_clicks} onChange={(event) => setForm((current) => ({ ...current, max_clicks: event.target.value }))} placeholder="Unlimited" className={inputClass()} /></Field>
                  </div>
                </div>
              </details>

              <button disabled={saving} type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 text-sm font-black text-white shadow-lg shadow-rose-950/25 transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editing ? "Save changes" : "Create short link"}
              </button>
            </form>
          </AdminSectionCard>

          {editing ? (
            <AdminSectionCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Activity</p><h2 className="mt-1 text-lg font-black text-white">Recent clicks</h2></div>
                <AdminStatusBadge tone="muted">{editing.click_count} total</AdminStatusBadge>
              </div>
              <div className="mt-4 space-y-2">
                {detailsLoading ? <p className="text-sm font-bold text-white/40">Loading activity…</p> : null}
                {!detailsLoading && !recentClicks.length ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm font-bold text-white/40">No clicks yet. Activity will appear here after the link is used.</p> : null}
                {!detailsLoading && recentClicks.slice(0, 10).map((click) => (
                  <div key={click.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-white">{formatDate(click.clicked_at)}</p><p className="text-xs font-bold text-white/35">{[click.city, click.region, click.country].filter(Boolean).join(", ") || "Location unavailable"}</p></div>
                    <p className="mt-1 truncate text-xs text-white/45">{click.referrer || "Direct / no referrer"}</p>
                    {(click.utm_source || click.utm_campaign) ? <p className="mt-1 truncate text-xs font-bold text-rose-100/70">{[click.utm_source, click.utm_medium, click.utm_campaign].filter(Boolean).join(" · ")}</p> : null}
                  </div>
                ))}
              </div>
            </AdminSectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
