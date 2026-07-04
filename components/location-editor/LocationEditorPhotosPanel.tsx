"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { toSelectedLocationRequestContext, type LocationEditorContext } from "./location-editor-context";

const inputClass = "w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-[#e1062a]/70";
function dedupe(urls: string[]) { return Array.from(new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))); }

export default function LocationEditorPhotosPanel({ context, mainImage, images, onChange }: { context: LocationEditorContext; mainImage: string; images: string[]; onChange: (main: string, images: string[]) => void }) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const mainRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const gallery = dedupe([...(images || []), mainImage].filter(Boolean));
  function setMain(url: string) { onChange(url, dedupe([url, ...gallery])); }
  async function upload(files: FileList | null, imageType: "main" | "gallery") {
    if (!files?.length) return setMessage("Please choose an image file.");
    setUploading(true); setMessage("Uploading photo…");
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
        if (file.size > 8 * 1024 * 1024) throw new Error("Image must be smaller than 8MB.");
        const form = new FormData(); form.set("file", file); form.set("imageType", imageType);
        Object.entries(toSelectedLocationRequestContext(context)).forEach(([k, v]) => { if (v !== undefined && v !== null) form.set(k, String(v)); });
        const res = await fetch(`/api/admin/locations/${encodeURIComponent(context.canonicalLocationId || context.effectiveLocationId)}/photos/upload`, { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
        uploaded.push(String(json.url));
      }
      if (imageType === "main") onChange(uploaded[0] || mainImage, dedupe([uploaded[0], ...gallery]));
      else onChange(mainImage || uploaded[0] || "", dedupe([...gallery, ...uploaded]));
      setMessage("Photo uploaded");
    } catch (e: any) { setMessage(e.message || "Upload failed"); }
    finally { setUploading(false); if (mainRef.current) mainRef.current.value = ""; if (galleryRef.current) galleryRef.current.value = ""; }
  }
  return <div className="grid gap-4"><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Primary Image URL</span><input value={mainImage} onChange={(e)=>setMain(e.target.value)} className={inputClass} placeholder="https://..." /></label>{mainImage ? <Image src={mainImage} alt="Primary location preview" width={900} height={360} className="h-52 w-full rounded-2xl object-cover" unoptimized /> : <div className="grid h-52 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-bold text-white/35">No primary image set</div>}<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-white/65">Upload main image<input ref={mainRef} type="file" accept="image/*" disabled={uploading} onChange={(e)=>upload(e.target.files,"main")} className={inputClass}/></label><label className="grid gap-2 text-sm font-bold text-white/65">Upload gallery images<input ref={galleryRef} type="file" accept="image/*" multiple disabled={uploading} onChange={(e)=>upload(e.target.files,"gallery")} className={inputClass}/></label></div>{message ? <p className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm font-bold text-white/70">{message}</p> : null}<div className="grid gap-3 sm:grid-cols-3">{gallery.slice(0, 9).map((image) => <button type="button" key={image} onClick={() => setMain(image)} className="overflow-hidden rounded-2xl border border-white/10 text-left"><Image src={image} alt="Gallery image" width={260} height={160} className="h-24 w-full object-cover" unoptimized /><span className="block px-3 py-2 text-xs font-bold text-white/60">Set as main</span></button>)}</div></div>;
}
