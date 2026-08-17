"use client";

import { useMemo, useState } from "react";

const fieldBase = "w-full rounded-xl border bg-black/30 px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:ring-4";
const fieldClass = `${fieldBase} border-white/10 focus:border-[#ff2142]/60 focus:ring-[#ff2142]/10`;
const fieldErrorClass = `${fieldBase} border-red-400/70 focus:border-red-400 focus:ring-red-400/10`;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 8 * 1024 * 1024;

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

function editablePrice(item: any) {
  if (item?.price_cents != null) return (Number(item.price_cents) / 100).toFixed(2);
  const label = String(item?.price_label || item?.price || "").replace(/[$,]/g, "").trim();
  return /^\d+(\.\d{1,2})?$/.test(label) ? label : "";
}

function priceError(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^\$?\d+(\.\d{0,2})?$/.test(trimmed.replace(/,/g, ""))) return "Use a valid price such as 14 or 14.99.";
  const numeric = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return "Price cannot be negative.";
  return "";
}

export default function QuickAddMenuItem({ locationId, sections, items, contextKey, contextPayload }: Props) {
  const [editingItemId, setEditingItemId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ? String(sections[0].id) : "__new__");
  const [newSection, setNewSection] = useState(sections.length ? "" : "General");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const editingItem = items.find((item: any) => String(item.id) === editingItemId);
  const sectionById = useMemo(() => new Map(sections.map((section) => [String(section.id), sectionName(section)])), [sections]);
  const nameError = !name.trim() ? "Item name is required." : "";
  const currentPriceError = priceError(price);
  const categoryError = sectionId === "__new__" && !newSection.trim() ? "Enter a category name." : "";
  const showNameError = Boolean(nameError && (attemptedSave || touched.name));
  const showPriceError = Boolean(currentPriceError && (attemptedSave || touched.price));
  const showCategoryError = Boolean(categoryError && (attemptedSave || touched.category));
  const hasErrors = Boolean(nameError || currentPriceError || categoryError);

  function touch(field: string) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function resetForm() {
    setEditingItemId("");
    setName("");
    setPrice("");
    setDescription("");
    setImageUrl("");
    setSectionId(sections[0]?.id ? String(sections[0].id) : "__new__");
    setNewSection(sections.length ? "" : "General");
    setAttemptedSave(false);
    setTouched({});
    setMessage("");
  }

  function editItem(item: any) {
    setEditingItemId(String(item.id));
    setName(String(item.name || ""));
    setPrice(editablePrice(item));
    setDescription(String(item.description || ""));
    setImageUrl(String(item.image_url || ""));
    setSectionId(item.section_id ? String(item.section_id) : (sections[0]?.id ? String(sections[0].id) : "__new__"));
    setNewSection("");
    setAttemptedSave(false);
    setTouched({});
    setMessage(`Editing ${item.name || "item"}. Save when you are finished.`);
    requestAnimationFrame(() => document.getElementById("menu-item-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function api(method: string, body: Record<string, unknown>) {
    const res = await fetch("/api/business/menu", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...contextPayload, [contextKey]: locationId, locationId, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || json?.error || "We could not save this item.");
    return json;
  }

  async function upload(file: File | null) {
    if (!file) return;
    setMessage("");
    if (!allowedImageTypes.has(file.type)) return setMessage("Photo format not supported. Use JPG, PNG, WebP, or GIF.");
    if (file.size > maxImageBytes) return setMessage("Photo is too large. Maximum file size is 8 MB.");

    setUploading(true);
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
      if (!res.ok || !json?.url) throw new Error(json?.message || json?.error || "Image upload failed.");
      setImageUrl(String(json.url));
      setMessage("Photo uploaded. Finish the item details, then save.");
    } catch (error: any) {
      setMessage(error?.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function saveItem() {
    if (saving || uploading) return;
    setAttemptedSave(true);
    setTouched({ name: true, price: true, category: true });
    setMessage("");

    if (hasErrors) {
      setMessage("Fix the highlighted field before saving this item.");
      const target = nameError ? "menu-item-name" : currentPriceError ? "menu-item-price" : "menu-item-category";
      document.getElementById(target)?.focus();
      return;
    }

    const numericPrice = price.trim() ? Number(String(price).replace(/[$,]/g, "").trim()) : 0;
    setSaving(true);
    try {
      let targetSectionId = sectionId;
      if (sectionId === "__new__" || !sectionId) {
        const title = newSection.trim();
        const sectionResult = await api("POST", { action: "create_section", title });
        const created = (sectionResult?.data?.sections || sectionResult?.sections || []).find((entry: any) => sectionName(entry).toLowerCase() === title.toLowerCase());
        if (!created?.id) throw new Error("The category was created, but could not be selected. Refresh and try again.");
        targetSectionId = String(created.id);
      }

      const cents = price.trim() ? Math.round(numericPrice * 100) : null;
      const common = {
        section_id: targetSectionId,
        name: name.trim(),
        description: description.trim(),
        price_cents: cents,
        price_label: price.trim() ? `$${numericPrice.toFixed(2)}` : "",
        image_url: imageUrl,
        tags: editingItem?.tags || [],
        is_available: editingItem ? editingItem.is_available !== false : true,
        is_featured: editingItem?.is_featured === true,
      };

      if (editingItemId) {
        await api("PATCH", { action: "update_item", item_id: editingItemId, ...common });
        setMessage("Item updated. Refreshing your menu...");
      } else {
        await api("POST", { action: "create_item", ...common });
        setMessage("Item added. Refreshing your menu...");
      }
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || "We could not save this item.");
      setSaving(false);
    }
  }

  const errorMessage = message.toLowerCase().includes("fix") || message.toLowerCase().includes("failed") || message.toLowerCase().includes("could not") || message.toLowerCase().includes("not supported") || message.toLowerCase().includes("too large");

  return (
    <section id="menu-item-editor" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-[#0c1017] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">{editingItemId ? "Editing menu item" : "Fastest way to build this page"}</p>
          <h2 className="mt-1 text-2xl font-black">{editingItemId ? `Edit ${editingItem?.name || "item"}` : "Add what you sell"}</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/55">{editingItemId ? "Update the item details below. You can change its category, price, description, or photo." : "Enter the item, add a photo, then choose where it belongs. Required fields are marked and formatting errors appear immediately."}</p>
          <p className="mt-2 text-xs font-bold text-white/35"><span className="text-[#ff6b86]">*</span> Required field</p>
        </div>
        <div className="flex items-center gap-2">
          {editingItemId ? <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/60 hover:bg-white/[0.05]">Cancel edit</button> : null}
          <p className="text-xs font-bold text-white/35">{items.length} saved item{items.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2" htmlFor="menu-item-name"><span className="text-xs font-black text-white/60">Item name <span className="text-[#ff6b86]">* Required</span></span><input id="menu-item-name" aria-invalid={showNameError} className={showNameError ? fieldErrorClass : fieldClass} value={name} onBlur={() => touch("name")} onChange={(event) => { setName(event.target.value); setMessage(""); }} placeholder="Example: Truffle Fries" />{showNameError ? <p className="text-xs font-bold text-red-300">{nameError}</p> : null}</label>
          <label className="grid gap-1" htmlFor="menu-item-price"><span className="text-xs font-black text-white/60">Price <span className="font-semibold text-white/30">Optional</span></span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-white/35">$</span><input id="menu-item-price" aria-invalid={showPriceError} className={`${showPriceError ? fieldErrorClass : fieldClass} pl-7`} inputMode="decimal" value={price} onBlur={() => touch("price")} onChange={(event) => { setPrice(event.target.value); setMessage(""); }} placeholder="14.00" /></div>{showPriceError ? <p className="text-xs font-bold text-red-300">{currentPriceError}</p> : <p className="text-[11px] font-semibold text-white/30">Use dollars, for example 14 or 14.99.</p>}</label>
          <label className="grid gap-1" htmlFor="menu-item-category"><span className="text-xs font-black text-white/60">Category <span className="text-[#ff6b86]">* Required</span></span><select id="menu-item-category" className={fieldClass} value={sectionId} onBlur={() => touch("category")} onChange={(event) => { setSectionId(event.target.value); setMessage(""); }}>{sections.map((section) => <option key={String(section.id)} value={String(section.id)}>{sectionName(section)}</option>)}<option value="__new__">+ Create a new category</option></select></label>
          {sectionId === "__new__" ? <label className="grid gap-1 sm:col-span-2" htmlFor="menu-new-category"><span className="text-xs font-black text-white/60">New category name <span className="text-[#ff6b86]">* Required</span></span><input id="menu-new-category" aria-invalid={showCategoryError} className={showCategoryError ? fieldErrorClass : fieldClass} value={newSection} onBlur={() => touch("category")} onChange={(event) => { setNewSection(event.target.value); setMessage(""); }} placeholder="Example: Cocktails, Packages, Activities" />{showCategoryError ? <p className="text-xs font-bold text-red-300">{categoryError}</p> : null}</label> : null}
          <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-black text-white/60">Description <span className="font-semibold text-white/30">Optional</span></span><textarea className={fieldClass} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short description guests will understand." /></label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Photo <span className="normal-case tracking-normal text-white/30">Optional</span></p>
          {imageUrl ? <img src={imageUrl} alt="Item preview" className="mt-3 h-40 w-full rounded-xl object-cover" /> : <div className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-white/15 bg-black/20 px-6 text-center text-xs font-bold text-white/35">Add a photo so guests can see the item before they choose it.</div>}
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-white/75 hover:bg-white/[0.08]"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading || saving} onChange={(event) => { const file = event.target.files?.[0] || null; void upload(file); event.currentTarget.value = ""; }} />{uploading ? "Uploading photo..." : imageUrl ? "Replace photo" : "Upload photo"}</label>
          <p className="mt-2 text-center text-[11px] font-semibold text-white/30">JPG, PNG, WebP, or GIF · up to 8 MB</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className={`text-sm font-semibold ${errorMessage ? "text-red-300" : "text-white/50"}`}>{message || (editingItemId ? "Make your changes, then save the item." : "Required fields are marked. You can organize categories later.")}</div>
        <button type="button" onClick={saveItem} disabled={saving || uploading} className="rounded-xl bg-[#ff2142] px-6 py-3 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : uploading ? "Uploading..." : editingItemId ? "Save changes" : "Add item"}</button>
      </div>

      {items.length ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-black">Your menu items</h3><p className="mt-1 text-xs font-semibold text-white/35">Click any item to edit its details.</p></div><p className="text-xs font-bold text-white/35">{items.length} item{items.length === 1 ? "" : "s"}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item: any) => {
              const active = String(item.id) === editingItemId;
              return <button type="button" key={String(item.id)} onClick={() => editItem(item)} className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-[#ff2142]/60 bg-[#ff2142]/10" : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]"}`}>{item.image_url ? <img src={item.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[10px] font-black text-white/25">NO PHOTO</div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-black text-white">{item.name || "Untitled item"}</p><span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[#ff6b86]">Edit</span></div><p className="mt-1 text-xs font-bold text-white/50">{itemPrice(item)}</p><p className="mt-1 truncate text-xs font-semibold text-white/35">{sectionById.get(String(item.section_id)) || "Uncategorized"}</p></div></button>;
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
