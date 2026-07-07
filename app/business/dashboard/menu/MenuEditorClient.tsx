"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Props = {
  initialData: any;
  locationId: string;
  mode?: "business" | "admin";
  contextKey?: "locationId" | "adminLocationId" | "demoLocationId";
  returnHref?: string;
  canEdit?: boolean;
  embedded?: boolean;
  contextPayload?: Record<string, any>;
};

type MenuItemDraft = {
  section_id: string;
  name: string;
  description: string;
  price_cents: string;
  price_label: string;
  image_url: string;
  tags: string;
  is_available: boolean;
  is_featured: boolean;
};

const input = "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#ff2142]/10";
const button = "rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50";
const redButton = "rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20 disabled:opacity-50";

const emptyDraft = (sectionId = ""): MenuItemDraft => ({
  section_id: sectionId,
  name: "",
  description: "",
  price_cents: "",
  price_label: "",
  image_url: "",
  tags: "",
  is_available: true,
  is_featured: false,
});

function draftFromItem(entry: any, fallbackSectionId = ""): MenuItemDraft {
  const tags = Array.isArray(entry?.tags) ? entry.tags.join(", ") : String(entry?.tags || "");
  return {
    section_id: String(entry?.section_id || fallbackSectionId || ""),
    name: String(entry?.name || ""),
    description: String(entry?.description || ""),
    price_cents: entry?.price_cents != null ? String(entry.price_cents) : "",
    price_label: String(entry?.price_label || entry?.price || ""),
    image_url: String(entry?.image_url || ""),
    tags,
    is_available: entry?.is_available !== false,
    is_featured: Boolean(entry?.is_featured),
  };
}

function normalizeDraft(draft: MenuItemDraft) {
  return {
    ...draft,
    price_cents: draft.price_cents ? Number(draft.price_cents) : null,
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

export default function MenuEditorClient({ initialData, locationId, contextKey = "locationId", returnHref, canEdit, embedded = false, contextPayload = {} }: Props) {
  const [data, setData] = useState(initialData?.data || initialData);
  const effectiveCanEdit = canEdit ?? data?.permissions?.canEdit !== false;
  const [busy, setBusy] = useState(false);
  const page = data?.page || {};
  const sections = data?.sections || [];
  const items = data?.items || [];
  const [settings, setSettings] = useState({ title: page.title || "Menu", description: page.description || "", external_url: page.external_url || "", pdf_url: page.pdf_url || "", status: page.status || (page.is_active ? "published" : "draft") });
  const [sectionTitle, setSectionTitle] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>(sections[0]?.id || "");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [itemDraft, setItemDraft] = useState<MenuItemDraft>(emptyDraft(sections[0]?.id || ""));
  const [editingMode, setEditingMode] = useState<"selected" | "new">("new");

  const grouped = useMemo(() => items.reduce((acc: Record<string, any[]>, entry: any) => {
    const key = entry.section_id || "";
    (acc[key] ||= []).push(entry);
    return acc;
  }, {}), [items]);
  const selectedSection = sections.find((section: any) => section.id === selectedSectionId) || sections[0];
  const visibleItems = selectedSection ? grouped[selectedSection.id] || [] : items;
  const selectedItem = items.find((entry: any) => entry.id === selectedItemId) || visibleItems[0] || null;
  const stats = { sections: sections.length, items: items.length, unavailable: items.filter((entry: any) => entry.is_available === false).length };

  useEffect(() => {
    if (!selectedSectionId && sections[0]?.id) setSelectedSectionId(sections[0].id);
  }, [sections, selectedSectionId]);

  useEffect(() => {
    if (editingMode === "selected" && selectedItem) setItemDraft(draftFromItem(selectedItem, selectedSection?.id));
  }, [selectedItem?.id, editingMode, selectedSection?.id]);

  useEffect(() => {
    if (!selectedItemId && visibleItems[0]?.id) setSelectedItemId(visibleItems[0].id);
  }, [visibleItems, selectedItemId]);

  async function call(method: string, body: any) {
    setBusy(true);
    const res = await fetch("/api/business/menu", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...contextPayload, ...body, [contextKey]: locationId, locationId }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return alert(json.message || "Menu could not be saved");
    setData(json.data);
    return json;
  }

  async function createSection() {
    if (!sectionTitle.trim()) return;
    const title = sectionTitle.trim();
    const json = await call("POST", { action: "create_section", title });
    setSectionTitle("");
    const nextSection = json?.data?.sections?.find((section: any) => section.title === title || section.name === title);
    if (nextSection?.id) {
      setSelectedSectionId(nextSection.id);
      setItemDraft(emptyDraft(nextSection.id));
    }
  }

  async function createItem() {
    const targetSectionId = itemDraft.section_id || selectedSection?.id || "";
    await call("POST", { action: "create_item", ...normalizeDraft({ ...itemDraft, section_id: targetSectionId }) });
    setEditingMode("new");
    setItemDraft(emptyDraft(targetSectionId));
  }

  async function updateSelectedItem() {
    if (!selectedItem?.id) return;
    await call("PATCH", { action: "update_item", item_id: selectedItem.id, ...normalizeDraft(itemDraft) });
  }

  const shellClass = embedded ? "text-white" : "min-h-screen bg-[#07090d] p-4 text-white sm:p-6 lg:p-8";
  const wrapClass = embedded ? "space-y-6" : "mx-auto max-w-[1600px] space-y-6";

  return <main className={shellClass}>
    <div className={wrapClass}>
      {!embedded ? <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[#10131a] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-widest text-rose-200">Business Menu</p><h1 className="mt-1 text-3xl font-black">Menu Editor</h1><p className="mt-2 text-sm font-bold text-white/45">{data?.location?.name || data?.location?.location_name || "Selected location"}</p></div>
        <MenuActions status={settings.status} previewUrl={data?.previewUrl} returnHref={returnHref} canEdit={effectiveCanEdit} busy={busy} onPublish={() => call("PATCH", { action: settings.status === "published" ? "unpublish_page" : "publish_page", ...settings })} />
      </div> : null}

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c1017] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black">Menu Editor</h2>
            <p className="mt-1 text-sm font-bold text-white/45">Larger workspace with sections, readable item rows, and a real item inspector.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={data?.previewUrl || "#"} className={button}>Preview Menu</Link>
            <button type="button" className={button}>Bulk Edit</button>
            <button type="button" onClick={() => { setEditingMode("new"); setItemDraft(emptyDraft(selectedSection?.id || sections[0]?.id || "")); }} className={redButton}>+ Add Item</button>
          </div>
        </div>

        <div className="grid min-h-[760px] xl:grid-cols-[280px_minmax(560px,1fr)_420px] 2xl:grid-cols-[300px_minmax(680px,1fr)_460px]">
          <aside className="border-b border-white/10 bg-black/10 p-5 xl:border-b-0 xl:border-r">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-black">Menu Sections</h3><button type="button" className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-lg font-black">+</button></div>
            <div className="grid gap-3">
              {sections.map((section: any) => {
                const active = section.id === (selectedSection?.id || selectedSectionId);
                return <button key={section.id} type="button" onClick={() => { setSelectedSectionId(section.id); setItemDraft((prev) => ({ ...prev, section_id: section.id })); }} className={`rounded-2xl border px-4 py-4 text-left transition ${active ? "border-[#ff2142]/60 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"}`}><p className="font-black">{section.title || section.name || "Untitled"}</p><p className="mt-1 text-xs font-bold text-white/40">{(grouped[section.id] || []).length} items</p></button>;
              })}
              {!sections.length ? <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm font-bold text-white/50">No sections yet.</div> : null}
              <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black/20 p-3"><input value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} placeholder="New section name" className={input} /><button disabled={!effectiveCanEdit || busy || !sectionTitle.trim()} onClick={createSection} className="mt-2 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/70 disabled:opacity-50">Add Section</button></div>
            </div>
          </aside>

          <section className="min-w-0 border-b border-white/10 p-5 xl:border-b-0 xl:border-r">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-xl font-black">{selectedSection?.title || selectedSection?.name || "All Items"}</h3><p className="mt-1 text-sm font-bold text-white/40">{visibleItems.length} visible items · {stats.unavailable} unavailable</p></div><button type="button" onClick={() => { setEditingMode("new"); setItemDraft(emptyDraft(selectedSection?.id || sections[0]?.id || "")); }} className={redButton}>+ Add Item</button></div>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(280px,1fr)_110px_130px_170px] gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-white/35"><span>Item Name</span><span>Price</span><span>Availability</span><span>Tags</span></div>
                <div className="divide-y divide-white/10">
                  {visibleItems.map((entry: any) => {
                    const active = entry.id === selectedItem?.id && editingMode === "selected";
                    const price = entry.price_label || entry.price || (entry.price_cents != null ? `$${(entry.price_cents / 100).toFixed(2)}` : "—");
                    const tags = Array.isArray(entry.tags) ? entry.tags : typeof entry.tags === "string" ? entry.tags.split(",") : [];
                    return <button key={entry.id} type="button" onClick={() => { setSelectedItemId(entry.id); setEditingMode("selected"); setItemDraft(draftFromItem(entry, selectedSection?.id)); }} className={`grid w-full grid-cols-[minmax(280px,1fr)_110px_130px_170px] items-center gap-4 px-5 py-5 text-left transition ${active ? "bg-[#e1062a]/12" : "bg-black/10 hover:bg-white/[0.035]"}`}>
                      <span className="min-w-0"><span className="block truncate text-base font-black text-white">{entry.name || "Untitled item"}</span><span className="mt-1 block truncate text-sm font-semibold text-white/45">{entry.description || "No description"}</span></span>
                      <span className="text-sm font-black text-white/75">{price}</span>
                      <span className={entry.is_available === false ? "text-xs font-black text-white/35" : "text-xs font-black text-emerald-300"}>{entry.is_available === false ? "Hidden" : "Live"}</span>
                      <span className="truncate text-xs font-black text-[#ff9bb6]">{tags.slice(0, 3).join(", ") || "—"}</span>
                    </button>;
                  })}
                  {!visibleItems.length ? <div className="p-10 text-center text-sm font-bold text-white/45">No items in this section yet.</div> : null}
                </div>
              </div>
            </div>
          </section>

          <aside className="bg-black/10 p-5">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">{editingMode === "selected" ? "Edit Item" : "New Item"}</h3><p className="mt-1 text-sm font-bold text-white/40">Readable inspector with full editing space.</p></div><Status status={settings.status} /></div>
            <div className="space-y-4">
              <select className={input} value={itemDraft.section_id || selectedSection?.id || ""} onChange={(event) => setItemDraft({ ...itemDraft, section_id: event.target.value })}>{sections.map((section: any) => <option key={section.id} value={section.id}>{section.title || section.name}</option>)}</select>
              <input className={input} placeholder="Item name" value={itemDraft.name} onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })} />
              <textarea className={input} rows={6} placeholder="Description" value={itemDraft.description} onChange={(event) => setItemDraft({ ...itemDraft, description: event.target.value })} />
              <div className="grid grid-cols-2 gap-3"><input className={input} placeholder="Price cents" value={itemDraft.price_cents} onChange={(event) => setItemDraft({ ...itemDraft, price_cents: event.target.value })} /><input className={input} placeholder="Price label" value={itemDraft.price_label} onChange={(event) => setItemDraft({ ...itemDraft, price_label: event.target.value })} /></div>
              <input className={input} placeholder="Image URL" value={itemDraft.image_url} onChange={(event) => setItemDraft({ ...itemDraft, image_url: event.target.value })} />
              <input className={input} placeholder="Tags comma-separated" value={itemDraft.tags} onChange={(event) => setItemDraft({ ...itemDraft, tags: event.target.value })} />
              <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-white/65"><label className="flex items-center justify-between gap-3"><span>Available</span><input type="checkbox" checked={itemDraft.is_available} onChange={(event) => setItemDraft({ ...itemDraft, is_available: event.target.checked })} /></label><label className="flex items-center justify-between gap-3"><span>Featured</span><input type="checkbox" checked={itemDraft.is_featured} onChange={(event) => setItemDraft({ ...itemDraft, is_featured: event.target.checked })} /></label></div>
              {editingMode === "selected" && selectedItem ? <div className="grid gap-3"><button disabled={!effectiveCanEdit || busy || !itemDraft.name.trim()} onClick={updateSelectedItem} className="w-full rounded-2xl bg-[#ff2142] px-5 py-3 text-sm font-black text-white disabled:opacity-50">Save Selected Item</button><button disabled={!effectiveCanEdit || busy} onClick={() => call("DELETE", { action: "delete_item", item_id: selectedItem.id })} className="w-full rounded-2xl border border-[#ff2142]/40 px-4 py-3 text-sm font-black text-[#ff9bb6] disabled:opacity-50">Delete Item</button></div> : <button disabled={!effectiveCanEdit || busy || !itemDraft.name.trim()} onClick={createItem} className="w-full rounded-2xl bg-[#ff2142] px-5 py-3 text-sm font-black text-white disabled:opacity-50">Create Item</button>}
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Menu page settings"><div className="grid gap-3 md:grid-cols-2"><label>Title<input className={input} value={settings.title} onChange={(event) => setSettings({ ...settings, title: event.target.value })} /></label><label>Status<select className={input} value={settings.status} onChange={(event) => setSettings({ ...settings, status: event.target.value })}><option>draft</option><option>published</option><option>hidden</option></select></label><label className="md:col-span-2">Description<textarea className={input} rows={3} value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} /></label><label>External menu URL<input className={input} value={settings.external_url} onChange={(event) => setSettings({ ...settings, external_url: event.target.value })} /></label><label>PDF menu URL<input className={input} value={settings.pdf_url} onChange={(event) => setSettings({ ...settings, pdf_url: event.target.value })} /></label></div><button disabled={!effectiveCanEdit || busy} onClick={() => call("PATCH", { action: "update_page", ...settings })} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-black text-black disabled:opacity-50">Save settings</button></Card>
        <Card title="Summary"><p>{stats.sections} sections</p><p>{stats.items} items</p><p>{stats.unavailable} unavailable</p><p className="mt-3 text-sm text-white/45">Last updated: {page.updated_at ? new Date(page.updated_at).toLocaleString() : "Not saved"}</p></Card>
      </div>
    </div>
  </main>;
}

function MenuActions({ status, previewUrl, returnHref, canEdit, busy, onPublish }: any) { return <div className="flex flex-wrap gap-2"><Status status={status} /><Link href={previewUrl || "#"} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black">Preview public menu</Link>{returnHref ? <Link href={returnHref} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black">Back</Link> : null}<button disabled={!canEdit || busy} onClick={onPublish} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-black disabled:opacity-50">{status === "published" ? "Unpublish" : "Publish"}</button></div>; }
function Card({ title, action, children }: any) { return <section className="rounded-[1.6rem] border border-white/10 bg-[#10131a] p-5 shadow-xl shadow-black/20"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-black">{title}</h2>{action}</div>{children}</section>; }
function Status({ status }: any) { return <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-rose-100">{status || "draft"}</span>; }
