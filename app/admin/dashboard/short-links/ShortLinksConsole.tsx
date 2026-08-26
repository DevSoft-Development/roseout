"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  MousePointerClick,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  user_agent: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
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
  ["generic", "General"],
  ["outing", "Outing"],
  ["location", "Location"],
  ["claim", "Claim"],
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
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
  return "min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10";
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</span>
      <div className="mt-2">{children}</div>
      {helper ? <span className="mt-1 block text-xs text-white/35">{helper}</span> : null}
    </label>
  );
}

function IconButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${danger ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20" : "border-white/10 bg-white/[0.05] text-white/65 hover:border-white/20 hover:text-white"}`}
    >
      {children}
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
    const active = links.filter((link) => link.is_active && !isExpired(link) && !isClickCapped(link)).length;
    const totalClicks = links.reduce((sum, link) => sum + Number(link.click_count || 0), 0);
    const clicked = links.filter((link) => link.click_count > 0).length;
    const inactive = links.length - active;
    return { active, totalClicks, clicked, inactive };
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
      expires_at: link.expires_at ? new Date(link.expires_at).toISOString().slice(0, 16) : "",
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
      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${notice.tone === "good" ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-rose-300/25 bg-rose-500/10 text-rose-100"}`}>
          {notice.text}
        </div>
      ) : null}

      <AdminKpiGrid>
        <AdminKpiCard label="Links loaded" value={links.length} helper="Current filtered view" icon={Link2} />
        <AdminKpiCard label="Active" value={metrics.active} helper={`${metrics.inactive} inactive, expired, or capped`} icon={Power} />
        <AdminKpiCard label="Total clicks" value={metrics.totalClicks} helper={`${metrics.clicked} links have activity`} icon={MousePointerClick} />
        <AdminKpiCard label="Brand domain" value="outhvn.com" helper="Editable destinations, branded redirects" icon={ExternalLink} />
      </AdminKpiGrid>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
        <AdminSectionCard className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Registry</p>
              <h2 className="mt-1 text-xl font-black text-white">Branded links</h2>
            </div>
            <button type="button" onClick={() => void loadLinks()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-black text-white/70 hover:text-white">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-white focus-within:border-rose-300/50">
              <Search className="h-4 w-4 shrink-0 text-white/35" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, title, or destination" className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold outline-none placeholder:text-white/30" />
            </label>
            <div className="flex gap-2 overflow-x-auto">
              {(["all", "active", "inactive"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-black capitalize ${statusFilter === value ? "border-rose-300/50 bg-[#ec0b5b] text-white" : "border-white/10 bg-white/[0.04] text-white/55 hover:text-white"}`}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center text-sm font-bold text-white/45">Loading short links…</div> : null}
            {!loading && !links.length ? <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm font-bold text-white/45">No short links match this view.</div> : null}
            {!loading && links.map((link) => {
              const state = linkState(link);
              return (
                <article key={link.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 hover:bg-white/[0.04]">
                  <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void copy(link)} className="max-w-full truncate text-left text-base font-black text-white hover:text-rose-100">{link.short_url}</button>
                        <AdminStatusBadge tone={state.tone}>{state.label}</AdminStatusBadge>
                        <AdminStatusBadge tone="muted">{link.link_type}</AdminStatusBadge>
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-white/55">{link.title || link.destination_url}</p>
                      <p className="mt-1 truncate text-xs text-white/35">→ {link.destination_url}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-white/40">
                        <span>{link.click_count.toLocaleString()} clicks</span>
                        <span>Created {formatDate(link.created_at)}</span>
                        <span>Last click {formatDate(link.last_clicked_at)}</span>
                        {link.expires_at ? <span>Expires {formatDate(link.expires_at)}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <IconButton label="Copy short link" onClick={() => void copy(link)}>{copiedId === link.id ? <Check className="h-4 w-4 text-emerald-200" /> : <Copy className="h-4 w-4" />}</IconButton>
                      <a href={link.short_url} target="_blank" rel="noreferrer" aria-label="Open short link" title="Open short link" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/65 hover:text-white"><ExternalLink className="h-4 w-4" /></a>
                      <IconButton label="Edit short link" onClick={() => void openEditor(link)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={link.is_active ? "Disable short link" : "Enable short link"} onClick={() => void toggleActive(link)} danger={link.is_active}><Power className="h-4 w-4" /></IconButton>
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
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">{editing ? "Edit link" : "Create link"}</p>
                <h2 className="mt-1 text-xl font-black text-white">{editing ? editing.short_url : "New outhvn.com link"}</h2>
              </div>
              {editing ? <IconButton label="Close editor" onClick={resetForm}><X className="h-4 w-4" /></IconButton> : <span className="rounded-xl border border-rose-200/20 bg-rose-500/10 p-2 text-rose-100"><Plus className="h-5 w-5" /></span>}
            </div>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <Field label="Destination URL"><input required type="url" value={form.destination_url} onChange={(event) => setForm((current) => ({ ...current, destination_url: event.target.value }))} placeholder="https://theouthaven.com/..." className={inputClass()} /></Field>
              <Field label="Title"><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Internal label" className={inputClass()} /></Field>
              {!editing ? <Field label="Custom code" helper="Optional. Leave blank for an automatic code."><div className="flex min-h-11 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0d] focus-within:border-rose-300/50"><span className="flex items-center border-r border-white/10 px-3 text-sm font-black text-white/40">outhvn.com/</span><input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="automatic" className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30" /></div></Field> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Link type"><select value={form.link_type} onChange={(event) => setForm((current) => ({ ...current, link_type: event.target.value }))} className={inputClass()}>{LINK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Entity type"><input value={form.entity_type} onChange={(event) => setForm((current) => ({ ...current, entity_type: event.target.value }))} placeholder="location, event…" className={inputClass()} /></Field>
              </div>
              <Field label="Entity ID"><input value={form.entity_id} onChange={(event) => setForm((current) => ({ ...current, entity_id: event.target.value }))} placeholder="Optional internal ID" className={inputClass()} /></Field>
              <Field label="Campaign ID"><input value={form.campaign_id} onChange={(event) => setForm((current) => ({ ...current, campaign_id: event.target.value }))} placeholder="Optional campaign UUID" className={inputClass()} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Expires"><input type="datetime-local" value={form.expires_at} onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))} className={inputClass()} /></Field>
                <Field label="Max clicks"><input type="number" min="1" step="1" value={form.max_clicks} onChange={(event) => setForm((current) => ({ ...current, max_clicks: event.target.value }))} placeholder="Unlimited" className={inputClass()} /></Field>
              </div>
              <button disabled={saving} type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 text-sm font-black text-white shadow-lg shadow-rose-950/25 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editing ? "Save changes" : "Create short link"}
              </button>
            </form>
          </AdminSectionCard>

          {editing ? (
            <AdminSectionCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Analytics</p><h2 className="mt-1 text-lg font-black text-white">Recent clicks</h2></div>
                <AdminStatusBadge tone="muted">{editing.click_count} total</AdminStatusBadge>
              </div>
              <div className="mt-4 space-y-2">
                {detailsLoading ? <p className="text-sm font-bold text-white/40">Loading click activity…</p> : null}
                {!detailsLoading && !recentClicks.length ? <p className="text-sm font-bold text-white/40">No click activity yet.</p> : null}
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
