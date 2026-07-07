"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Props = { initialData: any; locationId: string; mode?: "business" | "admin"; contextKey?: "locationId" | "adminLocationId" | "demoLocationId"; returnHref?: string; canEdit?: boolean; embedded?: boolean; contextPayload?: Record<string, any> };
const input = "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-rose-300/50";
const button = "rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50";
const redButton = "rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-3 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20 disabled:opacity-50";

export default function MenuEditorClient({ initialData, locationId, contextKey = "locationId", returnHref, canEdit, embedded = false, contextPayload = {} }: Props) {
  const [data, setData] = useState(initialData?.data || initialData);
  const effectiveCanEdit = canEdit ?? data?.permissions?.canEdit !== false;
  const [busy, setBusy] = useState(false);
  const page = data?.page || {};
  const sections = data?.sections || [];
  const items = data?.items || [];
  const [settings, setSettings] = useState({ title: page.title || "Menu", description: page.description || "", external_url: page.external_url || "", pdf_url: page.pdf_url || "", status: page.status || (page.is_active ? "published" : "draft") });
  const [sectionTitle, setSectionTitle] = useState("");
  const [item, setItem] = useState({ section_id: "", name: "", description: "", price_cents: "", price_label: "", image_url: "", tags: "", is_available: true, is_featured: false });
  const [selectedSectionId, setSelectedSectionId] = useState<string>(sections[0]?.id || "");
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const grouped = useMemo(() => items.reduce((acc: Record<string, any[]>, entry: any) => { const key = entry.section_id || ""; (acc[key] ||= []).push(entry); return acc; }, {}), [items]);
  const selectedSection = sections.find((section: any) => section.id === selectedSectionId) || sections[0];
  const visibleItems = selectedSection ? grouped[selectedSection.id] || [] : items;
  const selectedItem = items.find((entry: any) => entry.id === selectedItemId) || visibleItems[0] || null;
  const stats = { sections: sections.length, items: items.length, unavailable: items.filter((entry: any) => entry.is_available === false).length };

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
    const json = await call("POST", { action: "create_section", title: sectionTitle.trim() });
    setSectionTitle("");
    const nextSection = json?.data?.sections?.find((section: any) => section.title === sectionTitle.trim() || section.name === sectionTitle.trim());
    if (nextSection?.id) setSelectedSectionId(nextSection.id);
  }

  async function createItem() {
    const targetSectionId = item.section_id || selectedSection?.id || "";
    const payload = { ...item, section_id: targetSectionId, price_cents: item.price_cents ? Number(item.price_cents) : null, tags: item.tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
    await call("POST", { action: "create_item", ...payload });
    setItem({ ...item, name: "", description: "", price_cents: "", price_label: "", image_url: "", tags: "" });
  }

  const shellClass = embedded ? "text-white" : "min-h-screen bg-[#07090d] p-4 text-white sm:p-6 lg:p-8";
  const wrapClass = embedded ? "space-y-5" : "mx-auto max-w-7xl space-y-5";

  return <main className={shellClass}>
    <div className={wrapClass}>
      {!embedded ? <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.25),transparent_35%),linear-gradient(135deg,#14090d,#0a0b10)] p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">TheOutHaven Commerce</p><h1 className="mt-2 text-4xl font-black">Menu Manager</h1><p className="mt-2 text-white/60">Create, edit, preview, and publish your menu.</p><p className="mt-2 text-sm font-bold text-white/45">{data?.location?.name || data?.location?.location_name || "Selected location"}</p></div><MenuActions status={settings.status} previewUrl={data?.previewUrl} returnHref={returnHref} canEdit={effectiveCanEdit} busy={busy} onPublish={() => call("PATCH", { action: settings.status === "published" ? "unpublish_page" : "publish_page", ...settings })} /></div>
      </section> : null}

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1017] shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-2xl font-black">Menu Editor</h2><p className="mt-1 text-sm font-semibold text-white/50">Build and manage sections, items, pricing, and public publishing.</p></div>
          <div className="flex flex-wrap gap-2"><Link href={data?.previewUrl || "#"} className={button}>Preview Menu</Link><button disabled={!effectiveCanEdit || busy} onClick={() => call("PATCH", { action: settings.status === "published" ? "unpublish_page" : "publish_page", ...settings })} className={redButton}>{settings.status === "published" ? "Unpublish" : "Publish"}</button></div>
        </div>

        <div className="grid min-h-[700px] xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          <aside className="border-b border-white/10 bg-black/15 p-4 xl:border-b-0 xl:border-r">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-black uppercase tracking-[0.18em] text-white/45">Menu Sections</h3><button type="button" onClick={() => setSectionTitle(sectionTitle || "New Section")} className="grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-lg font-black">+</button></div>
            <div className="grid gap-2">
              {sections.map((section: any) => {
                const active = section.id === (selectedSection?.id || selectedSectionId);
                return <button key={section.id} type="button" onClick={() => { setSelectedSectionId(section.id); setItem((prev) => ({ ...prev, section_id: section.id })); }} className={`rounded-2xl border px-4 py-4 text-left transition ${active ? "border-[#ff2142]/60 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"}`}><p className="font-black">{section.title || section.name || "Untitled"}</p><p className="mt-1 text-xs font-bold text-white/40">{(grouped[section.id] || []).length} items</p></button>;
              })}
              {!sections.length ? <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm font-bold text-white/50">No sections yet.</div> : null}
              <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black/20 p-3"><input value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} placeholder="New section name" className={input} /><button disabled={!effectiveCanEdit || busy || !sectionTitle.trim()} onClick={createSection} className="mt-2 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/70 disabled:opacity-50">Add Section</button></div>
            </div>
          </aside>

          <section className="min-w-0 border-b border-white/10 p-4 xl:border-b-0 xl:border-r">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-lg font-black">{selectedSection?.title || selectedSection?.name || "All Items"}</h3><p className="mt-1 text-xs font-bold text-white/40">{visibleItems.length} visible items · {stats.unavailable} unavailable</p></div><button type="button" onClick={() => setItem((prev) => ({ ...prev, section_id: selectedSection?.id || sections[0]?.id || "" }))} className={redButton}>+ Add Item</button></div>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_120px] gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white/35"><span>Item Name</span><span>Price</span><span>Available</span><span>Tags</span></div>
              <div className="divide-y divide-white/10">
                {visibleItems.map((entry: any) => {
                  const active = entry.id === selectedItem?.id;
                  const price = entry.price_label || entry.price || (entry.price_cents != null ? `$${(entry.price_cents / 100).toFixed(2)}` : "—");
                  const tags = Array.isArray(entry.tags) ? entry.tags : typeof entry.tags === "string" ? entry.tags.split(",") : [];
                  return <button key={entry.id} type="button" onClick={() => setSelectedItemId(entry.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_90px_120px_120px] items-center gap-3 px-4 py-4 text-left transition ${active ? "bg-[#e1062a]/10" : "bg-black/10 hover:bg-white/[0.035]"}`}><span className="min-w-0"><span className="block truncate font-black text-white">{entry.name || "Untitled item"}</span><span className="mt-1 block truncate text-xs font-semibold text-white/40">{entry.description || "No description"}</span></span><span className="text-sm font-black text-white/70">{price}</span><span className={entry.is_available === false ? "text-xs font-black text-white/35" : "text-xs font-black text-emerald-300"}>{entry.is_available === false ? "Hidden" : "Live"}</span><span className="truncate text-xs font-black text-[#ff9bb6]">{tags.slice(0, 2).join(", ") || "—"}</span></button>;
                })}
                {!visibleItems.length ? <div className="p-8 text-center text-sm font-bold text-white/45">No items in this section yet.</div> : null}
              </div>
            </div>
          </section>

          <aside className="bg-black/10 p-4">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">Item Details</h3><p className="mt-1 text-xs font-bold text-white/40">Edit selected item or create a new one.</p></div><Status status={settings.status} /></div>
            {selectedItem ? <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="font-black">{selectedItem.name}</p><p className="mt-1 text-xs leading-5 text-white/45">{selectedItem.description || "No description"}</p><div className="mt-3 flex gap-2"><button disabled={!effectiveCanEdit || busy} onClick={() => call("PATCH", { action: "update_item", item_id: selectedItem.id, ...selectedItem, is_available: !selectedItem.is_available })} className={button}>{selectedItem.is_available === false ? "Mark available" : "Mark unavailable"}</button><button disabled={!effectiveCanEdit || busy} onClick={() => call("DELETE", { action: "delete_item", item_id: selectedItem.id })} className="rounded-2xl border border-[#ff2142]/40 px-4 py-3 text-sm font-black text-[#ff9bb6] disabled:opacity-50">Delete</button></div></div> : null}
            <div className="space-y-3"><select className={input} value={item.section_id || selectedSection?.id || ""} onChange={(event) => setItem({ ...item, section_id: event.target.value })}>{sections.map((section: any) => <option key={section.id} value={section.id}>{section.title || section.name}</option>)}</select><input className={input} placeholder="Item name" value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} /><textarea className={input} rows={4} placeholder="Description" value={item.description} onChange={(event) => setItem({ ...item, description: event.target.value })} /><div className="grid grid-cols-2 gap-3"><input className={input} placeholder="Price cents" value={item.price_cents} onChange={(event) => setItem({ ...item, price_cents: event.target.value })} /><input className={input} placeholder="Price label" value={item.price_label} onChange={(event) => setItem({ ...item, price_label: event.target.value })} /></div><input className={input} placeholder="Image URL" value={item.image_url} onChange={(event) => setItem({ ...item, image_url: event.target.value })} /><input className={input} placeholder="Tags comma-separated" value={item.tags} onChange={(event) => setItem({ ...item, tags: event.target.value })} /><div className="flex flex-wrap gap-3 text-sm font-bold text-white/60"><label><input type="checkbox" checked={item.is_available} onChange={(event) => setItem({ ...item, is_available: event.target.checked })} /> Available</label><label><input type="checkbox" checked={item.is_featured} onChange={(event) => setItem({ ...item, is_featured: event.target.checked })} /> Featured</label></div><button disabled={!effectiveCanEdit || busy || !item.name.trim()} onClick={createItem} className="w-full rounded-2xl bg-[#ff2142] px-5 py-3 text-sm font-black text-white disabled:opacity-50">Save Item</button></div>
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
