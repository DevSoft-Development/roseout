"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Section = {
  id: string;
  eyebrow: string | null;
  title: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
};

type Item = {
  id: string;
  section_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string | null;
  query: string | null;
  badge: string | null;
  location_id: string | null;
  sponsored: boolean;
  sponsor_label: string | null;
  enabled: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  metadata?: Record<string, unknown> | null;
};

type DiscoverPayload = { sections: Section[]; items: Item[]; error?: string };

const AUTO_SECTIONS = new Set(["trending", "popular-searches", "areas", "most-saved"]);

export default function DiscoverMerchandisingClient() {
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/marketing/discover", { cache: "no-store" });
      const data = (await response.json()) as DiscoverPayload;
      if (!response.ok) throw new Error(data.error || "Failed to load Discover content");
      setSections(data.sections || []);
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Discover content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const manualSections = useMemo(() => sections.filter((section) => !AUTO_SECTIONS.has(section.id)), [sections]);
  const automatedSections = useMemo(() => sections.filter((section) => AUTO_SECTIONS.has(section.id)), [sections]);

  async function patchSection(section: Section, updates: Partial<Section>) {
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/marketing/discover", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "section", id: section.id, ...updates }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Update failed"); return; }
    setMessage("Discover section updated.");
    await load();
  }

  async function createItem(form: FormData) {
    setMessage("");
    setError("");
    const body = {
      kind: "item",
      section_id: String(form.get("section_id") || ""),
      title: String(form.get("title") || ""),
      subtitle: String(form.get("subtitle") || ""),
      image_url: String(form.get("image_url") || ""),
      href: String(form.get("href") || ""),
      query: String(form.get("query") || ""),
      badge: String(form.get("badge") || ""),
      sponsored: form.get("sponsored") === "on",
      sponsor_label: form.get("sponsored") === "on" ? "Sponsored" : "",
      sort_order: Number(form.get("sort_order") || 0),
      starts_at: String(form.get("starts_at") || ""),
      ends_at: String(form.get("ends_at") || ""),
    };
    const response = await fetch("/api/admin/marketing/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Create failed"); return; }
    setMessage("Discover placement created.");
    await load();
  }

  async function toggleItem(item: Item) {
    const response = await fetch("/api/admin/marketing/discover", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "item", id: item.id, enabled: !item.enabled }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Update failed"); return; }
    await load();
  }

  async function deleteItem(item: Item) {
    const response = await fetch(`/api/admin/marketing/discover?kind=item&id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Delete failed"); return; }
    setMessage("Placement removed.");
    await load();
  }

  return (
    <div className="mt-6 space-y-6">
      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-200">{message}</div> : null}

      <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Automated every morning</p>
            <h2 className="mt-2 text-2xl font-black">Live demand sections</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">These sections are generated from search and save behavior. Marketing can turn a section on or off, but daily content is system-owned.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {automatedSections.map((section) => {
            const count = items.filter((item) => item.section_id === section.id && item.enabled).length;
            return (
              <div key={section.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-white/40">{section.eyebrow || section.id}</p>
                    <h3 className="mt-1 text-lg font-black">{section.title}</h3>
                    <p className="mt-2 text-xs text-white/45">{count} live items</p>
                  </div>
                  <button onClick={() => void patchSection(section, { enabled: !section.enabled })} className={`rounded-full px-3 py-1.5 text-xs font-black ${section.enabled ? "bg-emerald-400 text-black" : "bg-white/10 text-white/50"}`}>
                    {section.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <form action={(form) => void createItem(form)} className="rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] p-5 text-[#1b1210] shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-700">New placement</p>
          <h2 className="mt-2 text-2xl font-black">Add curated content</h2>
          <p className="mt-2 text-sm text-black/55">Use this for curated outings, partner spots, featured outings, or special collections.</p>
          <div className="mt-5 grid gap-3">
            <Field label="Section"><select name="section_id" required className="input"><option value="">Choose section</option>{manualSections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></Field>
            <Field label="Title"><input name="title" required className="input" placeholder="Dinner + Jazz in Manhattan" /></Field>
            <Field label="Subtitle"><input name="subtitle" className="input" placeholder="Steakhouse → live jazz · 8 min apart" /></Field>
            <Field label="Image URL"><input name="image_url" className="input" placeholder="https://…" /></Field>
            <Field label="Destination"><input name="href" className="input" placeholder="/locations/... or /create?..." /></Field>
            <Field label="Search query"><input name="query" className="input" placeholder="dinner and jazz" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Badge"><input name="badge" className="input" placeholder="Staff Pick" /></Field>
              <Field label="Order"><input name="sort_order" type="number" defaultValue="10" className="input" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts"><input name="starts_at" type="datetime-local" className="input" /></Field>
              <Field label="Ends"><input name="ends_at" type="datetime-local" className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-3 text-sm font-bold"><input name="sponsored" type="checkbox" /> Sponsored placement</label>
            <button type="submit" className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white">Add to Discover</button>
          </div>
        </form>

        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">Curated inventory</p>
            <h2 className="mt-2 text-2xl font-black">Manual & sponsored placements</h2>
          </div>
          {loading ? <p className="mt-6 text-sm text-white/50">Loading Discover content…</p> : null}
          <div className="mt-5 space-y-3">
            {items.filter((item) => !AUTO_SECTIONS.has(item.section_id)).map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-white/40">{sections.find((section) => section.id === item.section_id)?.title || item.section_id}</span>
                      {item.sponsored ? <span className="rounded-full bg-amber-300 px-2 py-1 text-[10px] font-black text-black">SPONSORED</span> : null}
                      {!item.enabled ? <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white/50">HIDDEN</span> : null}
                    </div>
                    <h3 className="mt-1 truncate text-lg font-black">{item.title}</h3>
                    {item.subtitle ? <p className="mt-1 text-sm text-white/50">{item.subtitle}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => void toggleItem(item)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black">{item.enabled ? "Hide" : "Show"}</button>
                    <button onClick={() => void deleteItem(item)} className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-200">Remove</button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && items.filter((item) => !AUTO_SECTIONS.has(item.section_id)).length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">No curated placements yet.</div> : null}
          </div>
        </div>
      </section>

      <style jsx>{`.input{width:100%;border:1px solid rgba(0,0,0,.12);background:#fff;border-radius:.75rem;padding:.75rem .85rem;font-size:.875rem;outline:none}.input:focus{border-color:#e11d48;box-shadow:0 0 0 3px rgba(225,29,72,.1)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-black/55"><span>{label}</span>{children}</label>;
}
