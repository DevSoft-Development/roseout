"use client";

import { useMemo, useRef, useState } from "react";

type WebsiteLike = {
  location_id: string;
  custom_content?: Record<string, unknown>;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function currentLogo(website: WebsiteLike) {
  const brand = objectValue(objectValue(website.custom_content).brand);
  return typeof brand.logo_url === "string" && brand.logo_url.trim() ? brand.logo_url.trim() : "";
}

export function WebsiteLogoManager({ initialWebsite, locationName }: { initialWebsite: WebsiteLike; locationName: string }) {
  const initialLogo = useMemo(() => currentLogo(initialWebsite), [initialWebsite]);
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.set("location_id", initialWebsite.location_id);
    form.set("logo", file);
    const response = await fetch("/api/business/website/logo", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok || !data.logo_url) {
      setMessage(data?.error || "We could not upload your logo.");
      return;
    }
    setLogoUrl(String(data.logo_url));
    setMessage("Logo saved. It will appear in preview and on the published website.");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/business/website/logo", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location_id: initialWebsite.location_id }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data?.error || "We could not remove your logo.");
      return;
    }
    setLogoUrl("");
    setMessage("Logo removed. The website will use the business name instead.");
  }

  return (
    <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff2142]">Website branding</p>
          <h2 className="mt-2 text-xl font-black">Business logo</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">Upload the logo you want displayed in the generated website header. PNG, JPG, or WebP up to 5 MB. A transparent PNG or WebP works best.</p>
        </div>
        <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3">
          {logoUrl ? <img src={logoUrl} alt={`${locationName} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-center text-xs font-black text-white/35">{locationName}</span>}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className={`cursor-pointer rounded-full bg-[#ff2142] px-5 py-3 text-sm font-black text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Saving…" : logoUrl ? "Replace logo" : "Upload logo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        {logoUrl ? <button type="button" onClick={() => void remove()} disabled={busy} className="rounded-full border border-white/15 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Remove logo</button> : null}
        <span className="text-xs text-white/40">Logo is preserved when AI redesigns the site.</span>
      </div>
      {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white/70">{message}</p> : null}
    </section>
  );
}
