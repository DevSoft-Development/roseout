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

type SectionDraft = {
  title: string;
  description: string;
  is_active: boolean;
};

const input = "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#ff2142]/10";
const denseInput = "w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#ff2142]/10";
const button = "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-wide text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
const redButton = "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-[#ff1654]/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton = "inline-flex items-center justify-center rounded-xl border border-[#ff2142]/40 bg-[#ff2142]/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#ff9bb6] transition hover:bg-[#ff2142]/18 disabled:cursor-not-allowed disabled:opacity-50";

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

const emptySectionDraft = (): SectionDraft => ({ title: "", description: "", is_active: true });

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

function draftFromSection(section: any): SectionDraft {
  return {
    title: String(section?.title || section?.name || ""),
    description: String(section?.description || ""),
    is_active: section?.is_active !== false,
  };
}

function normalizeDraft(draft: MenuItemDraft) {
  return {
    ...draft,
    price_cents: draft.price_cents === "" ? null : Number(draft.price_cents),
    price_label: draft.price_label.trim(),
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

function priceFor(entry: any) {
  if (entry?.price_label) return entry.price_label;
  if (entry?.price) return entry.price;
  if (entry?.price_cents != null) return `$${(Number(entry.price_cents) / 100).toFixed(2)}`;
  return "-";
}

function tagsFor(entry: any) {
  if (Array.isArray(entry?.tags)) return entry.tags.map(String).filter(Boolean);
  if (typeof entry?.tags === "string") return entry.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean);
  return [];
}

export default function MenuEditorClient({ initialData, locationId, contextKey = "locationId", returnHref, canEdit, embedded = false, contextPayload = {} }: Props) {
  const [data, setData] = useState(initialData?.data || initialData);
  const effectiveCanEdit = canEdit ?? data?.permissions?.canEdit !== false;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const page = data?.page || {};
  const sections = data?.sections || [];
  const items = data?.items || [];

  const [settings, setSettings] = useState({ title: page.title || "Menu", description: page.description || "", external_url: page.external_url || "", pdf_url: page.pdf_url || "", status: page.status || (page.is_active ? "published" : "draft") });
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>(sections[0]?.id || "");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [itemDraft, setItemDraft] = useState<MenuItemDraft>(emptyDraft(sections[0]?.id || ""));
  const [sectionDraft, setSectionDraft] = useState<SectionDraft>(emptySectionDraft());
  const [editingMode, setEditingMode] = useState<"selected" | "new">("new");

  const grouped = useMemo(() => items.reduce((acc: Record<string, any[]>, entry: any) => {
    const key = entry.section_id || "";
    (acc[key] ||= []).push(entry);
    return acc;
  }, {}), [items]);

  const selectedSection = sections.find((section: any) => section.id === selectedSectionId) || sections[0] || null;
  const visibleItems = selectedSection ? grouped[selectedSection.id] || [] : items;
  const selectedItem = items.find((entry: any) => entry.id === selectedItemId) || null;
  const stats = { sections: sections.length, items: items.length, unavailable: items.filter((entry: any) => entry.is_available === false).length };

  useEffect(() => {
    setSettings({ title: page.title || "Menu", description: page.description || "", external_url: page.external_url || "", pdf_url: page.pdf_url || "", status: page.status || (page.is_active ? "published" : "draft") });
  }, [page.id, page.updated_at]);

  useEffect(() => {
    if (!selectedSectionId && sections[0]?.id) setSelectedSectionId(sections[0].id);
  }, [sections, selectedSectionId]);

  useEffect(() => {
    if (selectedSection) setSectionDraft(draftFromSection(selectedSection));
    else setSectionDraft(emptySectionDraft());
  }, [selectedSection?.id]);

  useEffect(() => {
    if (editingMode === "selected" && selectedItem) setItemDraft(draftFromItem(selectedItem, selectedSection?.id));
  }, [selectedItem?.id, editingMode, selectedSection?.id]);

  useEffect(() => {
    if (selectedItemId && !items.some((entry: any) => entry.id === selectedItemId)) setSelectedItemId("");
  }, [items, selectedItemId]);

  async function call(method: string, body: any, successMessage?: string) {
    if (!effectiveCanEdit) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/business/menu", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...contextPayload, ...body, [contextKey]: locationId, locationId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.message || "Menu could not be saved");
        return null;
      }
      setData(json.data);
      if (successMessage) setNotice(successMessage);
      return json;
    } catch {
      alert("Menu could not be saved. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openPreview() {
    if (!data?.previewUrl) return alert("No public menu preview URL is available yet.");
    window.open(data.previewUrl, "_blank", "noopener,noreferrer");
  }

  async function uploadItemImage(file: File | null) {
    if (!file || !effectiveCanEdit) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    setUploadingImage(true);
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("locationId", locationId);
      formData.set(contextKey, locationId);
      for (const [key, value] of Object.entries(contextPayload || {})) {
        if (value === undefined || value === null) continue;
        formData.set(key, String(value));
      }
      const res = await fetch("/api/business/menu/item-image/upload", { method: "POST", body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        alert(json.message || json.error || "Menu item image could not be uploaded");
        return;
      }
      setItemDraft((draft) => ({ ...draft, image_url: String(json.url) }));
      setNotice("Menu item image uploaded. Save the item to keep it on the menu.");
    } catch {
      alert("Menu item image could not be uploaded. Check your connection and try again.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function createSection() {
    const title = newSectionTitle.trim();
    if (!title) return;
    const json = await call("POST", { action: "create_section", title }, "Section added");
    setNewSectionTitle("");
    const nextSection = json?.data?.sections?.find((section: any) => section.title === title || section.name === title);
    if (nextSection?.id) {
      setSelectedSectionId(nextSection.id);
      setEditingMode("new");
      setItemDraft(emptyDraft(nextSection.id));
    }
  }

  async function updateSection() {
    if (!selectedSection?.id || !sectionDraft.title.trim()) return;
    await call("PATCH", { action: "update_section", section_id: selectedSection.id, ...sectionDraft }, "Section saved");
  }

  async function deleteSection() {
    if (!selectedSection?.id) return;
    const count = (grouped[selectedSection.id] || []).length;
    const title = selectedSection.title || selectedSection.name || "this section";
    const warning = count ? `Delete "${title}" and its ${count} menu item${count === 1 ? "" : "s"}?` : `Delete "${title}"?`;
    if (!window.confirm(warning)) return;
    await call("DELETE", { action: "delete_section", section_id: selectedSection.id }, "Section deleted");
    const remaining = sections.filter((section: any) => section.id !== selectedSection.id);
    const nextId = remaining[0]?.id || "";
    setSelectedSectionId(nextId);
    setSelectedItemId("");
    setEditingMode("new");
    setItemDraft(emptyDraft(nextId));
  }

  function startNewItem() {
    const sectionId = selectedSection?.id || sections[0]?.id || "";
    setEditingMode("new");
    setSelectedItemId("");
    setItemDraft(emptyDraft(sectionId));
  }

  function selectItem(entry: any) {
    setSelectedItemId(entry.id);
    setEditingMode("selected");
    setItemDraft(draftFromItem(entry, entry.section_id || selectedSection?.id));
  }

  async function createItem() {
    const targetSectionId = itemDraft.section_id || selectedSection?.id || sections[0]?.id || "";
    if (!targetSectionId) return alert("Add or select a menu section first.");
    const json = await call("POST", { action: "create_item", ...normalizeDraft({ ...itemDraft, section_id: targetSectionId }) }, "Item added");
    const created = json?.data?.items?.find((entry: any) => entry.name === itemDraft.name && entry.section_id === targetSectionId);
    setEditingMode(created?.id ? "selected" : "new");
    setSelectedItemId(created?.id || "");
    setItemDraft(created ? draftFromItem(created, targetSectionId) : emptyDraft(targetSectionId));
  }

  async function updateSelectedItem(nextDraft = itemDraft) {
    if (!selectedItem?.id) return;
    await call("PATCH", { action: "update_item", item_id: selectedItem.id, ...normalizeDraft(nextDraft) }, "Item saved");
  }

  async function toggleItemAvailability(entry: any) {
    const draft = { ...draftFromItem(entry, entry.section_id || selectedSection?.id), is_available: entry.is_available === false };
    await call("PATCH", { action: "update_item", item_id: entry.id, ...normalizeDraft(draft) }, draft.is_available ? "Item is now live" : "Item hidden");
    if (selectedItemId === entry.id) setItemDraft(draft);
  }

  async function deleteSelectedItem() {
    if (!selectedItem?.id) return;
    if (!window.confirm(`Delete "${selectedItem.name || "this item"}" from the menu?`)) return;
    await call("DELETE", { action: "delete_item", item_id: selectedItem.id }, "Item deleted");
    setSelectedItemId("");
    setEditingMode("new");
    setItemDraft(emptyDraft(selectedSection?.id || sections[0]?.id || ""));
  }

  async function saveSettings(action = "update_page") {
    await call("PATCH", { action, ...settings }, action === "publish_page" ? "Menu published" : action === "unpublish_page" ? "Menu unpublished" : "Menu settings saved");
  }

  const shellClass = embedded ? "text-white" : "min-h-screen bg-[#07090d] p-4 text-white sm:p-6 lg:p-8";
  const wrapClass = embedded ? "space-y-5" : "mx-auto max-w-[1760px] space-y-5";
  const inspectorDisabled = !effectiveCanEdit || busy || uploadingImage;

  return <main className={shellClass}>
    <div className={wrapClass}>
      {!embedded ? <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[#10131a] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-widest text-rose-200">Business Menu</p><h1 className="mt-1 text-3xl font-black">Menu Editor</h1><p className="mt-2 text-sm font-bold text-white/45">{data?.location?.name || data?.location?.location_name || "Selected location"}</p></div>
        <MenuActions status={settings.status} previewUrl={data?.previewUrl} returnHref={returnHref} canEdit={effectiveCanEdit} busy={busy} onPublish={() => saveSettings(settings.status === "published" ? "unpublish_page" : "publish_page")} />
      </div> : null}

      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100">{notice}</div> : null}

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c1017] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
        <div className="flex flex-col gap-4 border-b border-white/10 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black">Menu Editor</h2>
            <p className="mt-1 text-sm font-bold text-white/45">Compact rows, working buttons, delete controls, and a larger editing inspector.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openPreview} className={button}>Preview Menu</button>
            <button type="button" onClick={() => setBulkMode((value) => !value)} className={button}>{bulkMode ? "Close Bulk Edit" : "Bulk Edit"}</button>
            <button type="button" disabled={!effectiveCanEdit || busy} onClick={startNewItem} className={redButton}>+ Add Item</button>
          </div>
        </div>

        {bulkMode ? <div className="border-b border-white/10 bg-[#ff2142]/8 p-4 text-sm font-bold text-white/70">Bulk Edit is intentionally lightweight here. Use the row availability buttons, section editor, and item inspector below for production-safe edits.</div> : null}

        <div className="grid min-h-[690px] xl:grid-cols-[260px_minmax(520px,1fr)_390px] 2xl:grid-cols-[280px_minmax(680px,1fr)_430px]">
          <aside className="border-b border-white/10 bg-black/10 p-4 xl:border-b-0 xl:border-r xl:border-white/10">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="text-lg font-black">Sections</h3><p className="text-xs font-bold text-white/35">{stats.sections} sections</p></div>
              <button type="button" onClick={() => setNewSectionTitle((value) => value || "New Section")} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lg font-black">+</button>
            </div>
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 xl:max-h-[430px]">
              {sections.map((section: any) => {
                const active = section.id === selectedSection?.id;
                const count = (grouped[section.id] || []).length;
                return <button key={section.id} type="button" onClick={() => { setSelectedSectionId(section.id); setEditingMode("new"); setSelectedItemId(""); setItemDraft(emptyDraft(section.id)); }} className={`rounded-xl border px-3 py-3 text-left transition ${active ? "border-[#ff2142]/60 bg-[#e1062a]/15 text-white" : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06]"}`}>
                  <span className="block truncate text-sm font-black">{section.title || section.name || "Untitled"}</span>
                  <span className="mt-1 block text-xs font-bold text-white/40">{count} item{count === 1 ? "" : "s"}</span>
                </button>;
              })}
              {!sections.length ? <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-sm font-bold text-white/50">No sections yet. Add one to start building the menu.</div> : null}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">Add Section</p>
              <input value={newSectionTitle} onChange={(event) => setNewSectionTitle(event.target.value)} placeholder="New section name" className={`${denseInput} mt-2`} />
              <button type="button" disabled={inspectorDisabled || !newSectionTitle.trim()} onClick={createSection} className="mt-2 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-white/70 disabled:opacity-50">Add Section</button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">Selected Section</p>
              <input value={sectionDraft.title} onChange={(event) => setSectionDraft({ ...sectionDraft, title: event.target.value })} placeholder="Section title" className={`${denseInput} mt-2`} />
              <textarea value={sectionDraft.description} onChange={(event) => setSectionDraft({ ...sectionDraft, description: event.target.value })} rows={2} placeholder="Section description" className={`${denseInput} mt-2`} />
              <label className="mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-black text-white/60"><span>Active</span><input type="checkbox" checked={sectionDraft.is_active} onChange={(event) => setSectionDraft({ ...sectionDraft, is_active: event.target.checked })} /></label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={inspectorDisabled || !selectedSection?.id || !sectionDraft.title.trim()} onClick={updateSection} className={button}>Save</button>
                <button type="button" disabled={inspectorDisabled || !selectedSection?.id} onClick={deleteSection} className={dangerButton}>Delete</button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 border-b border-white/10 p-4 xl:border-b-0 xl:border-r xl:border-white/10">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div><h3 className="text-xl font-black">{selectedSection?.title || selectedSection?.name || "Menu Items"}</h3><p className="mt-1 text-xs font-bold text-white/40">{visibleItems.length} items in this section · {stats.unavailable} hidden across menu</p></div>
              <button type="button" disabled={!effectiveCanEdit || busy || !selectedSection?.id} onClick={startNewItem} className={redButton}>+ Add Item</button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[minmax(220px,1fr)_82px_86px_minmax(110px,.55fr)_76px] gap-3 border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/35">
                <span>Item Name</span><span>Price</span><span>Available</span><span>Tags</span><span className="text-right">Actions</span>
              </div>
              <div className="max-h-[470px] divide-y divide-white/10 overflow-y-auto 2xl:max-h-[540px]">
                {visibleItems.map((entry: any) => {
                  const active = entry.id === selectedItemId && editingMode === "selected";
                  const tags = tagsFor(entry);
                  return <div key={entry.id} role="button" tabIndex={0} onClick={() => selectItem(entry)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectItem(entry); }} className={`grid cursor-pointer grid-cols-[minmax(220px,1fr)_82px_86px_minmax(110px,.55fr)_76px] items-center gap-3 px-3 py-2 text-left transition ${active ? "bg-[#e1062a]/12" : "bg-black/10 hover:bg-white/[0.035]"}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{entry.name || "Untitled item"}</p>
                      <p className="truncate text-xs font-semibold text-white/42">{entry.description || "No description"}</p>
                    </div>
                    <p className="text-sm font-black text-white/75">{priceFor(entry)}</p>
                    <button type="button" disabled={inspectorDisabled} onClick={(event) => { event.stopPropagation(); toggleItemAvailability(entry); }} className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${entry.is_available === false ? "border border-white/10 bg-white/[0.04] text-white/40" : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{entry.is_available === false ? "Hidden" : "Live"}</button>
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {tags.slice(0, 2).map((tag: string) => <span key={tag} className="max-w-[92px] truncate rounded-full border border-[#ff2142]/20 bg-[#ff2142]/10 px-2 py-1 text-[10px] font-black text-[#ff9bb6]">{tag}</span>)}
                      {tags.length > 2 ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black text-white/40">+{tags.length - 2}</span> : null}
                      {!tags.length ? <span className="text-xs font-bold text-white/30">-</span> : null}
                    </div>
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={(event) => { event.stopPropagation(); selectItem(entry); }} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black text-white/55 hover:bg-white/[0.06]">Edit</button>
                    </div>
                  </div>;
                })}
                {!visibleItems.length ? <div className="p-8 text-center text-sm font-bold text-white/45">No items in this section yet. Click Add Item to create one.</div> : null}
              </div>
            </div>
          </section>

          <aside className="bg-black/10 p-4">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-xl font-black">{editingMode === "selected" ? "Edit Item" : "New Item"}</h3><p className="mt-1 text-xs font-bold text-white/40">Changes save to the selected location menu.</p></div><Status status={settings.status} /></div>
            <div className="space-y-3">
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Section</span><select className={denseInput} value={itemDraft.section_id || selectedSection?.id || ""} onChange={(event) => setItemDraft({ ...itemDraft, section_id: event.target.value })}>{sections.map((section: any) => <option key={section.id} value={section.id}>{section.title || section.name}</option>)}</select></label>
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Item Name</span><input className={denseInput} placeholder="Item name" value={itemDraft.name} onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })} /></label>
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Description</span><textarea className={denseInput} rows={4} placeholder="Description" value={itemDraft.description} onChange={(event) => setItemDraft({ ...itemDraft, description: event.target.value })} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Price Cents</span><input className={denseInput} placeholder="1400" value={itemDraft.price_cents} onChange={(event) => setItemDraft({ ...itemDraft, price_cents: event.target.value })} /></label><label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Price Label</span><input className={denseInput} placeholder="$14" value={itemDraft.price_label} onChange={(event) => setItemDraft({ ...itemDraft, price_label: event.target.value })} /></label></div>
              <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Item Image</span>
                  {itemDraft.image_url ? <a href={itemDraft.image_url} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-wide text-[#ff9bb6]">Open</a> : null}
                </div>
                {itemDraft.image_url ? <img src={itemDraft.image_url} alt="Menu item preview" className="h-28 w-full rounded-xl object-cover" /> : <div className="grid h-28 place-items-center rounded-xl border border-dashed border-white/15 bg-black/25 text-xs font-bold text-white/35">No image selected</div>}
                <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Image URL</span><input className={denseInput} placeholder="https://..." value={itemDraft.image_url} onChange={(event) => setItemDraft({ ...itemDraft, image_url: event.target.value })} /></label>
                <label className={`${button} cursor-pointer`}>
                  <input type="file" accept="image/*" className="sr-only" disabled={inspectorDisabled || uploadingImage} onChange={(event) => { const file = event.target.files?.[0] || null; void uploadItemImage(file); event.currentTarget.value = ""; }} />
                  {uploadingImage ? "Uploading..." : "Upload Image"}
                </label>
                <p className="text-[11px] font-bold leading-5 text-white/35">Uploads save to the menu item image bucket and fill the item image URL automatically.</p>
              </div>
              <label className="grid gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Tags</span><input className={denseInput} placeholder="Popular, Vegetarian" value={itemDraft.tags} onChange={(event) => setItemDraft({ ...itemDraft, tags: event.target.value })} /></label>
              <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm font-bold text-white/65"><label className="flex items-center justify-between gap-3"><span>Available</span><input type="checkbox" checked={itemDraft.is_available} onChange={(event) => setItemDraft({ ...itemDraft, is_available: event.target.checked })} /></label><label className="flex items-center justify-between gap-3"><span>Featured</span><input type="checkbox" checked={itemDraft.is_featured} onChange={(event) => setItemDraft({ ...itemDraft, is_featured: event.target.checked })} /></label></div>
              {editingMode === "selected" && selectedItem ? <div className="grid gap-2"><button type="button" disabled={inspectorDisabled || !itemDraft.name.trim()} onClick={() => updateSelectedItem()} className="w-full rounded-xl bg-[#ff2142] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Save Item</button><button type="button" disabled={inspectorDisabled} onClick={deleteSelectedItem} className="w-full rounded-xl border border-[#ff2142]/40 px-4 py-2.5 text-sm font-black text-[#ff9bb6] disabled:opacity-50">Delete Item</button><button type="button" onClick={startNewItem} className="w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-black text-white/60">Create New Instead</button></div> : <button type="button" disabled={inspectorDisabled || !itemDraft.name.trim()} onClick={createItem} className="w-full rounded-xl bg-[#ff2142] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Create Item</button>}
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Menu page settings"><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/35">Title<input className={input} value={settings.title} onChange={(event) => setSettings({ ...settings, title: event.target.value })} /></label><label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/35">Status<select className={input} value={settings.status} onChange={(event) => setSettings({ ...settings, status: event.target.value })}><option value="draft">draft</option><option value="published">published</option><option value="hidden">hidden</option></select></label><label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/35 md:col-span-2">Description<textarea className={input} rows={3} value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} /></label><label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/35">External menu URL<input className={input} value={settings.external_url} onChange={(event) => setSettings({ ...settings, external_url: event.target.value })} /></label><label className="grid gap-1 text-xs font-black uppercase tracking-[0.16em] text-white/35">PDF menu URL<input className={input} value={settings.pdf_url} onChange={(event) => setSettings({ ...settings, pdf_url: event.target.value })} /></label></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={inspectorDisabled} onClick={() => saveSettings("update_page")} className={redButton}>Save Settings</button><button type="button" disabled={inspectorDisabled} onClick={() => saveSettings(settings.status === "published" ? "unpublish_page" : "publish_page")} className={button}>{settings.status === "published" ? "Unpublish" : "Publish"}</button></div></Card>
        <Card title="Summary"><p>{stats.sections} sections</p><p>{stats.items} items</p><p>{stats.unavailable} hidden</p><p className="mt-3 text-sm text-white/45">Last updated: {page.updated_at ? new Date(page.updated_at).toLocaleString() : "Not saved"}</p></Card>
      </div>
    </div>
  </main>;
}

function MenuActions({ status, previewUrl, returnHref, canEdit, busy, onPublish }: any) { return <div className="flex flex-wrap gap-2"><Status status={status} />{previewUrl ? <Link href={previewUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-4 py-2 text-sm font-black">Preview public menu</Link> : null}{returnHref ? <Link href={returnHref} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black">Back</Link> : null}<button type="button" disabled={!canEdit || busy} onClick={onPublish} className="rounded-full bg-rose-600 px-5 py-2 text-sm font-black disabled:opacity-50">{status === "published" ? "Unpublish" : "Publish"}</button></div>; }
function Card({ title, action, children }: any) { return <section className="rounded-[1.6rem] border border-white/10 bg-[#10131a] p-5 shadow-xl shadow-black/20"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-black">{title}</h2>{action}</div>{children}</section>; }
function Status({ status }: any) { return <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-rose-100">{status || "draft"}</span>; }
