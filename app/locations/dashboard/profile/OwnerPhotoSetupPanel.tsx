"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Images, Star, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import SafeLocationImage from "@/components/public-location/SafeLocationImage";

type LocationType = "restaurants" | "activities";

type PhotoState = {
  ownerPhotoUrls: string[];
  ownerPrimaryPhotoUrl: string | null;
  googlePlaceId: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function dedupe(values: unknown[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

export default function OwnerPhotoSetupPanel({
  locationId,
  locationType,
  claimSetup = false,
}: {
  locationId: string;
  locationType: LocationType;
  claimSetup?: boolean;
}) {
  const [state, setState] = useState<PhotoState>({ ownerPhotoUrls: [], ownerPrimaryPhotoUrl: null, googlePlaceId: null });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/locations/edit-context?type=${locationType}&id=${encodeURIComponent(locationId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload.location) throw new Error(payload.error || "Unable to load photos.");
      const location = payload.location as Record<string, unknown>;
      const ownerPhotoUrls = Array.isArray(location.owner_photo_urls)
        ? dedupe(location.owner_photo_urls)
        : [];
      const ownerPrimaryPhotoUrl = clean(location.owner_primary_photo_url) || ownerPhotoUrls[0] || null;
      setState({
        ownerPhotoUrls,
        ownerPrimaryPhotoUrl,
        googlePlaceId: clean(location.google_place_id) || null,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load photos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [locationId, locationType]);

  const ownerCount = state.ownerPhotoUrls.length;
  const status = ownerCount >= 5
    ? "Gallery complete"
    : ownerCount >= 3
      ? "Recommended minimum reached"
      : ownerCount > 0
        ? "Great start"
        : "Using available public imagery";
  const googleFillCount = state.googlePlaceId ? Math.max(0, 5 - ownerCount) : 0;
  const progress = Math.min(100, Math.round((ownerCount / 5) * 100));

  const previewSlots = useMemo(() => {
    const owner = state.ownerPhotoUrls.map((url) => ({ url, source: "owner" as const }));
    const google = state.googlePlaceId
      ? Array.from({ length: Math.max(0, 5 - owner.length) }, (_, index) => ({
          url: `/api/public/google-place-photo?placeId=${encodeURIComponent(state.googlePlaceId!)}&index=${index}&maxwidth=900`,
          source: "google" as const,
        }))
      : [];
    return [...owner, ...google].slice(0, 5);
  }, [state.googlePlaceId, state.ownerPhotoUrls]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, Math.max(1, 5 - ownerCount));
    const invalid = selected.find((file) => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024);
    if (invalid) {
      setMessage("Choose image files smaller than 8MB each.");
      return;
    }

    setUploading(true);
    setMessage("");
    try {
      let latestCount = ownerCount;
      let latestPrimary = state.ownerPrimaryPhotoUrl;
      for (const file of selected) {
        const form = new FormData();
        form.set("file", file);
        form.set("imageType", latestCount === 0 ? "main" : "gallery");
        const response = await fetch(`/api/admin/locations/${encodeURIComponent(locationId)}/photos/upload`, {
          method: "POST",
          body: form,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Upload failed.");
        latestCount = Number(payload.ownerPhotoCount || latestCount + 1);
        latestPrimary = payload.ownerPrimaryPhotoUrl || latestPrimary;
      }
      await load();
      setMessage(latestCount >= 5
        ? "Your five-photo gallery is complete."
        : latestCount >= 3
          ? "You reached the recommended photo minimum."
          : "Photo added. Add a few more to make your profile yours.");
      if (latestPrimary) setState((current) => ({ ...current, ownerPrimaryPhotoUrl: latestPrimary }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function manage(action: "set_primary" | "remove" | "reorder", options: { url?: string; urls?: string[] }) {
    setMessage("");
    const response = await fetch("/api/locations/photos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, action, ...options }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setMessage(payload.error || "Could not update photos.");
      return;
    }
    setState((current) => ({
      ...current,
      ownerPhotoUrls: dedupe(payload.ownerPhotoUrls || []),
      ownerPrimaryPhotoUrl: payload.ownerPrimaryPhotoUrl || null,
    }));
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.ownerPhotoUrls.length) return;
    const next = [...state.ownerPhotoUrls];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void manage("reorder", { urls: next });
  }

  if (loading) {
    return <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-white"><div className="h-6 w-48 animate-pulse rounded bg-white/10" /><div className="mt-4 h-36 animate-pulse rounded-2xl bg-white/5" /></section>;
  }

  return (
    <section id="photos" className={`rounded-3xl border p-5 text-white sm:p-6 ${claimSetup ? "border-[#ff2142]/35 bg-[linear-gradient(135deg,rgba(225,6,42,.12),rgba(255,255,255,.035))]" : "border-white/10 bg-white/[0.035]"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">{claimSetup ? "Claim setup · Photos" : "Your photos"}</p>
          <h2 className="mt-2 text-2xl font-black">Make your profile yours</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/50">
            Add photos of your space, food, drinks, activities, or atmosphere. Your uploads appear before third-party imagery across TheOutHaven.
          </p>
        </div>
        <div className="min-w-[210px] rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-black"><span>{ownerCount} of 5 owner photos</span><span className="text-white/45">{progress}%</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ff2142] transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs font-bold text-white/55">{status}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => {
          const slot = previewSlots[index];
          return (
            <div key={index} className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black/25">
              {slot ? (
                <>
                  {slot.source === "google" ? (
                    <SafeLocationImage src={slot.url} alt={`Profile photo ${index + 1}`} priority={index === 0} className="h-full w-full object-cover" />
                  ) : (
                    <img src={slot.url} alt={`Profile photo ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} className="h-full w-full object-cover" />
                  )}
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${slot.source === "owner" ? "bg-emerald-500/90 text-white" : "bg-black/75 text-white/80"}`}>
                    {slot.source === "owner" ? "Your photo" : "Google fill"}
                  </span>
                  {slot.source === "owner" && state.ownerPrimaryPhotoUrl === slot.url ? <span className="absolute right-2 top-2 rounded-full bg-[#e1062a] p-1.5 text-white" title="Cover photo"><Star size={12} className="fill-current" /></span> : null}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-white/25"><Images size={24} /><span className="text-[10px] font-black uppercase tracking-wide">Photo {index + 1}</span></div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[#e1062a] px-5 text-sm font-black text-white transition hover:bg-[#ff2142]">
          <ImagePlus size={17} /> {uploading ? "Uploading..." : ownerCount ? "Add photos" : "Upload your photos"}
          <input ref={inputRef} type="file" accept="image/*" multiple disabled={uploading || ownerCount >= 5} onChange={(event) => void upload(event.target.files)} className="sr-only" />
        </label>
        <span className="text-xs font-semibold text-white/40">3 recommended minimum · 5 completes the gallery · 8MB max each</span>
      </div>

      {googleFillCount > 0 ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-xs font-semibold leading-5 text-white/50">
          {ownerCount === 0 ? "Your profile can stay live while you finish setup. " : ""}
          TheOutHaven will use up to {googleFillCount} available Google {googleFillCount === 1 ? "photo" : "photos"} to fill open gallery spots until you upload your own.
        </p>
      ) : null}

      {state.ownerPhotoUrls.length ? (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">Manage your photos</p>
          {state.ownerPhotoUrls.map((url, index) => (
            <div key={url} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-2.5">
              <img src={url} alt={`Owner photo ${index + 1}`} className="h-14 w-20 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-white">Photo {index + 1}{state.ownerPrimaryPhotoUrl === url ? " · Cover" : ""}</p>
                <p className="mt-1 truncate text-[10px] font-semibold text-white/30">Your upload</p>
              </div>
              <div className="flex items-center gap-1">
                {state.ownerPrimaryPhotoUrl !== url ? <button type="button" onClick={() => void manage("set_primary", { url })} className="rounded-xl border border-white/10 p-2 text-white/60 hover:text-white" title="Set as cover"><Star size={14} /></button> : <span className="rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-2 text-emerald-200" title="Cover photo"><Check size={14} /></span>}
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-xl border border-white/10 p-2 text-white/60 disabled:opacity-25" title="Move earlier"><ChevronLeft size={14} /></button>
                <button type="button" disabled={index === state.ownerPhotoUrls.length - 1} onClick={() => move(index, 1)} className="rounded-xl border border-white/10 p-2 text-white/60 disabled:opacity-25" title="Move later"><ChevronRight size={14} /></button>
                <button type="button" onClick={() => void manage("remove", { url })} className="rounded-xl border border-rose-300/15 p-2 text-rose-200" title="Remove"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/70">{message}</p> : null}
    </section>
  );
}
