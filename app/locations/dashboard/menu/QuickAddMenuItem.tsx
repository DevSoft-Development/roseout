"use client";

import { useMemo, useState } from "react";

const fieldClass = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#ff2142]/10";

type Props = {
  locationId: string;
  sections: any[];
  items: any[];
  contextKey: "locationId" | "adminLocationId" | "demoLocationId";
  contextPayload: Record<string, unknown>;
};

function sectionName(section: any) {
  return String(section?.title || section?.name || "Uncategorized");
}

function itemPrice(item: any) {
  if (item?.price_label) return String(item.price_label);
  if (item?.price) return String(item.price);
  if (item?.price_cents != null) return `$${(Number(item.price_cents) / 100).toFixed(2)}`;
  return "Price not set";
}

export default function QuickAddMenuItem({ locationId, sections, items, contextKey, contextPayload }: Props) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ? String(sections[0].id) : "__new__");
  const [newSection, setNewSection] = useState(sections.length ? "" : "General");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const sectionById = useMemo(() => new Map(sections.map((section) => [String(section.id), sectionName(section)])), [sections]);

  async function api(method: string, body: Record<string, unknown>) {
    const res = await fetch("/api/business/menu", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...contextPayload, [contextKey]: locationId, locationId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || "We could not save this item.");
    return json;
  }

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("locationId", locationId);
      form.set(contextKey, locationId);
      for (const [key, value] of Object.entries(contextPayload)) {
        if (value === undefined || value === null) continue;
        form.set(key, String(value));
      }
      const res = await fetch("/api/business/menu/item-image/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.message || "Image upload failed.");
      setImageUrl(String(json.url));
      setMessage("Photo uploaded. Finish the item details, then save.");
    } catch (error: any) {
      setMessage(error?.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function saveItem() {
    if (!name.trim()) return setMessage("Add an item name first.");
    const numericPrice = Number(String(price).replace(/[$,]/g, "").trim());
    if (price.trim() && (!Number.isFinite(numericPrice) || numericPrice < 0)) return setMessage("Enter a valid price, for example 14 or 14.99.");

    setSaving(true);
    setMessage("");
    try {
      let targetSectionId = sectionId;
      if (sectionId === "__new__" || !sectionId) {
        const title = newSection.trim() || "General";
        const sectionResult = await api("POST", { action: "create_section", title });
        const created = (sectionResult?.data?.sections || []).find((entry: any) => sectionName(entry).toLowerCase() === title.toLowerCase());
        if (!created?.id) throw new Error("The category was created, but could not be selected. Refresh and try again.");
        targetSectionId = String(created.id);
      }

      const cents = price.trim() ? Math.round(numericPrice * 100) : null;
      await api("POST", {
        action: "create_item",
        section_id: targetSectionId,
        name: name.trim(),
        description: description.trim(),
        price_cents: cents,
        price_label: price.trim() ? `$${numericPrice.toFixed(2)}` : "",
        image_url: imageUrl,
        tags: [],
        is_available: true,
        is_featured: false,
      });

      setMessage("Item added. Refreshing your page...");
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || "We could not save this item.");
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#0c1017] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">Fastest way to build this page</p>
          <h2 className="mt-1 text-2xl font-black">Add what you sell</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/55">Enter the item, add a photo, then choose where it belongs. You do not need to create categories first.</p>
        </div>
        <p className="text-xs font-bold text-white/35">{items.length} saved item{items.length === 1 ? "" : "s"}</p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Item name</span><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Truffle Fries" /></label>
          <label className="grid gap-1"><span className="text-xs font-black text-white/60">Price</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-white/35">$</span><input className={`${fieldClass} pl-7`} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="14.00" /></div></label>
          <label className="grid gap-1"><span className="text-xs font-black text-white/60">Category</span><select className={fieldClass} value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{sections.map((section) => <option key={String(section.id)} value={String(section.id)}>{sectionName(section)}</option>)}<option value="__new__">+ Create a new category</option></select></label>
          {sectionId === "__new__" ? <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">New category name</span><input className={fieldClass} value={newSection} onChange={(event) => setNewSection(event.target.value)} placeholder="Example: Cocktails, Packages, Activities" /></label> : null}
          <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Description <span className="font-semibold text-white/30">optional</span></span><textarea className={fieldClass} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short description guests will understand." /></label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Photo</p>
          {imageUrl ? <img src={imageUrl} alt="New item preview" className="mt-3 h-40 w-full rounded-xl object-cover" /> : <div className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-white/15 bg-black/20 px-6 text-center text-xs font-bold text-white/35">Add a photo so guests can see the item before they choose it.</div>}
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white/75 hover:bg-white/[0.08]">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading || saving} onChange={(event) => { const file = event.target.files?.[0] || null; void upload(file); event.currentTarget.value = ""; }} />
            {uploading ? "Uploading photo..." : imageUrl ? "Replace photo" : "Upload photo"}
          </label>
          <p className="mt-2 text-center text-[11px] font-semibold text-white/30">JPG, PNG, WebP, or GIF · up to 8 MB</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-white/50">{message || "You can organize categories later. Add the item first."}</div>
        <button type="button" onClick={saveItem} disabled={saving || uploading || !name.trim()} className="rounded-xl bg-[#ff2142] px-6 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Add item"}</button>
      </div>

      {items.length ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-lg font-black">Items on this page</h3><p className="text-xs font-bold text-white/35">Categories can be adjusted in Advanced organization below.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item: any) => <div key={String(item.id)} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3">{item.image_url ? <img src={item.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[10px] font-black text-white/25">NO PHOTO</div>}<div className="min-w-0"><p className="truncate text-sm font-black text-white">{item.name || "Untitled item"}</p><p className="mt-1 text-xs font-bold text-white/50">{itemPrice(item)}</p><p className="mt-1 truncate text-xs font-semibold text-white/35">{sectionById.get(String(item.section_id)) || "Uncategorized"}</p></div></div>)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
