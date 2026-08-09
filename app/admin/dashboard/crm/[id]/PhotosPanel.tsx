"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import type { BusinessCRMRow } from "@/lib/admin-crm";

type Props = {
  business: BusinessCRMRow;
  canEdit: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
};

type ImageLike = {
  url?: unknown;
  src?: unknown;
};

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 disabled:opacity-60";

function dedupe(urls: string[]) {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

function normalizeImageArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return dedupe(
      value.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (!item || typeof item !== "object") return [];
        const image = item as ImageLike;
        return [image.url, image.src].filter((candidate): candidate is string => typeof candidate === "string");
      }),
    );
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeImageArray(parsed);
    } catch {}
    return dedupe(value.split(/[\n,]+/));
  }
  return [];
}
function getLocationMainImage(location: BusinessCRMRow) { return String(location.main_image || location.image_url || "").trim() || null; }
function getLocationGalleryImages(location: BusinessCRMRow) {
  return dedupe([
    ...normalizeImageArray(location.gallery_images),
    ...normalizeImageArray(location.gallery),
    ...normalizeImageArray(location.photos),
    ...normalizeImageArray(location.image_gallery),
    ...normalizeImageArray(location.images),
  ]);
}

export default function PhotosPanel({ business, canEdit, saveAction }: Props) {
  const initialMain = getLocationMainImage(business) || "";
  const initialGallery = useMemo(() => getLocationGalleryImages(business).filter((url) => url !== initialMain), [business, initialMain]);
  const [mainImage, setMainImage] = useState(initialMain);
  const [gallery, setGallery] = useState(initialGallery);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const mainFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: FileList | null, imageType: "main" | "gallery") {
    if (!files?.length) {
      setMessage("Please choose an image file.");
      return;
    }
    const selected = Array.from(files);
    const invalid = selected.find((file) => !file.type.startsWith("image/"));
    if (invalid) {
      setMessage("Please choose an image file.");
      return;
    }
    const tooLarge = selected.find((file) => file.size > 8 * 1024 * 1024);
    if (tooLarge) {
      setMessage("Image must be smaller than 8MB.");
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("imageType", imageType);
        const response = await fetch(`/api/admin/locations/${business.id}/photos/upload`, { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.url) throw new Error("Upload failed. Please try again.");
        uploaded.push(payload.url);
      }
      if (imageType === "main") setMainImage(uploaded[0] || "");
      else setGallery((current) => dedupe([...current, ...uploaded]));
      setMessage("Photo saved.");
    } catch {
      setMessage("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (mainFileRef.current) mainFileRef.current.value = "";
      if (galleryFileRef.current) galleryFileRef.current.value = "";
    }
  }

  function updateGalleryText(value: string) {
    setGallery(dedupe(value.split(/\n/)));
  }

  function move(index: number, direction: -1 | 1) {
    setGallery((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={saveAction} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <input type="hidden" name="location_id" value={business.id} />
      <input type="hidden" name="main_image" value={mainImage} />
      <input type="hidden" name="gallery_images" value={gallery.join("\n")} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Photos</h2>
          <p className="mt-2 text-sm text-white/55">Add image URLs or upload photos to improve the public location profile. Uploads use the location-images bucket.</p>
        </div>
        <button disabled={!canEdit} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Save photos</button>
      </div>

      {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">{message}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-4">
          <h3 className="font-black">Main image</h3>
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/30">{mainImage ? <Image unoptimized fill sizes="(min-width: 1024px) 50vw, 100vw" src={mainImage} alt="Current main image" className="object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-white/40">No main image yet</div>}</div>
          <label className="block space-y-2 text-sm font-bold text-white/65"><span>Main Image URL</span><input value={mainImage} onChange={(e) => setMainImage(e.target.value)} disabled={!canEdit} className={inputClass} placeholder="https://..." /></label>
          <label className="block space-y-2 text-sm font-bold text-white/65"><span>Upload Main Image</span><input ref={mainFileRef} type="file" accept="image/*" disabled={!canEdit || uploading} onChange={(e) => uploadFiles(e.target.files, "main")} className={inputClass} /></label>
        </section>

        <section className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-4">
          <h3 className="font-black">Gallery images</h3>
          <label className="block space-y-2 text-sm font-bold text-white/65"><span>Gallery image URLs, one per line</span><textarea value={gallery.join("\n")} onChange={(e) => updateGalleryText(e.target.value)} disabled={!canEdit} rows={9} className={inputClass} placeholder="https://..." /></label>
          <label className="block space-y-2 text-sm font-bold text-white/65"><span>Upload Gallery Images</span><input ref={galleryFileRef} type="file" accept="image/*" multiple disabled={!canEdit || uploading} onChange={(e) => uploadFiles(e.target.files, "gallery")} className={inputClass} /></label>
        </section>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {gallery.length ? gallery.map((url, index) => (
          <div key={`${url}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="relative aspect-video bg-black/40"><Image unoptimized fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" src={url} alt={`Gallery image ${index + 1}`} className="object-cover" /></div>
            <div className="flex flex-wrap gap-2 p-3 text-xs font-bold">
              <button type="button" disabled={!canEdit} onClick={() => setMainImage(url)} className="rounded-full border border-white/10 px-3 py-1 text-white/70 disabled:opacity-40">Set main</button>
              <button type="button" disabled={!canEdit || index === 0} onClick={() => move(index, -1)} className="rounded-full border border-white/10 px-3 py-1 text-white/70 disabled:opacity-40">Up</button>
              <button type="button" disabled={!canEdit || index === gallery.length - 1} onClick={() => move(index, 1)} className="rounded-full border border-white/10 px-3 py-1 text-white/70 disabled:opacity-40">Down</button>
              <button type="button" disabled={!canEdit} onClick={() => setGallery((current) => current.filter((_, i) => i !== index))} className="rounded-full border border-rose-300/20 px-3 py-1 text-rose-100 disabled:opacity-40">Remove</button>
            </div>
          </div>
        )) : <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/55">No gallery photos have been added yet. Add image URLs or upload photos to improve the public location profile.</div>}
      </div>
    </form>
  );
}
