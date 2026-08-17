"use client";

import { useState } from "react";

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#e1062a]/10";

type Props = {
  locationId: string;
  page: Record<string, any>;
  contextKey: "locationId" | "adminLocationId" | "demoLocationId";
  contextPayload: Record<string, unknown>;
};

export default function MenuPageBasics({ locationId, page, contextKey, contextPayload }: Props) {
  const [title, setTitle] = useState(String(page?.title || ""));
  const [description, setDescription] = useState(String(page?.description || ""));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const changed = title !== String(page?.title || "") || description !== String(page?.description || "");

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/business/menu", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...contextPayload,
          [contextKey]: locationId,
          locationId,
          action: "update_page",
          title: title.trim(),
          description: description.trim(),
          status: page?.status || (page?.is_active ? "published" : "draft"),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message || "We could not save these page details.");
      setMessage("Page details saved.");
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || "We could not save these page details.");
      setSaving(false);
    }
  }

  return (
    <section id="menu-basics" className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">2</span>
        <div>
          <h2 className="text-xl font-black">Page basics</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">Give guests a clear title and a short introduction before you start adding items.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-black text-white/60">Page name</span>
          <input className={inputClass} value={title} onChange={(event) => { setTitle(event.target.value); setMessage(""); }} placeholder="Food Menu, Birthday Packages, Private Events..." />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-black text-white/60">Short introduction <span className="font-semibold text-white/30">optional</span></span>
          <textarea className={inputClass} rows={3} value={description} onChange={(event) => { setDescription(event.target.value); setMessage(""); }} placeholder="Tell guests what they can expect on this page." />
        </label>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-white/45">{message || "You can change this later without rebuilding your items."}</p>
        <button type="button" onClick={save} disabled={saving || !changed || !title.trim()} className="rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving..." : changed ? "Save page details" : "Saved"}</button>
      </div>
    </section>
  );
}
