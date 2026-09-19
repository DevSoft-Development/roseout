"use client";

import { useState } from "react";

const inputClass = "w-full rounded-2xl border bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:ring-4";
const normalInputClass = `${inputClass} border-white/10 focus:border-[#ff2142]/60 focus:ring-[#e1062a]/10`;
const errorInputClass = `${inputClass} border-red-400/70 focus:border-red-400 focus:ring-red-400/10`;

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
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  const changed = title !== String(page?.title || "") || description !== String(page?.description || "");
  const titleError = !title.trim() ? "Page name is required." : "";
  const showTitleError = Boolean(titleError && (attemptedSave || titleTouched));

  async function save() {
    if (saving) return;
    setAttemptedSave(true);
    setTitleTouched(true);
    setMessage("");

    if (titleError) {
      setMessage("Fix the highlighted field before continuing.");
      document.getElementById("menu-page-title")?.focus();
      return;
    }

    if (!changed) {
      setMessage("Nothing changed. You can continue to the next step.");
      document.getElementById("menu-items")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setSaving(true);
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
      if (!response.ok) throw new Error(json?.message || json?.error || "We could not save these page details.");
      setMessage("Page details saved. Moving to the next step...");
      window.location.hash = "menu-items";
      window.location.reload();
    } catch (error: any) {
      setMessage(error?.message || "We could not save these page details.");
      setSaving(false);
    }
  }

  return (
    <section id="menu-basics" className="scroll-mt-28 rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e1062a]/15 text-sm font-black text-[#ff6b86]">2</span>
        <div>
          <h2 className="text-xl font-black">Page basics</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">Give guests a clear title and a short introduction before you start adding items.</p>
          <p className="mt-2 text-xs font-bold text-white/35"><span className="text-[#ff6b86]">*</span> Required field</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5" htmlFor="menu-page-title">
          <span className="text-xs font-black text-white/60">Page name <span className="text-[#ff6b86]">* Required</span></span>
          <input
            id="menu-page-title"
            aria-invalid={showTitleError}
            aria-describedby={showTitleError ? "menu-page-title-error" : undefined}
            className={showTitleError ? errorInputClass : normalInputClass}
            value={title}
            onBlur={() => setTitleTouched(true)}
            onChange={(event) => { setTitle(event.target.value); setMessage(""); }}
            placeholder="Food Menu, Birthday Packages, Private Events..."
          />
          {showTitleError ? <p id="menu-page-title-error" className="text-xs font-bold text-red-300">{titleError}</p> : null}
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-black text-white/60">Short introduction <span className="font-semibold text-white/30">Optional</span></span>
          <textarea className={normalInputClass} rows={3} value={description} onChange={(event) => { setDescription(event.target.value); setMessage(""); }} placeholder="Tell guests what they can expect on this page." />
        </label>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm font-semibold ${message.toLowerCase().includes("fix") || message.toLowerCase().includes("could not") ? "text-red-300" : "text-white/45"}`}>{message || "Required fields are marked. Errors appear as you type."}</p>
        <button type="button" onClick={save} disabled={saving} className="rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving..." : "Save & continue"}</button>
      </div>
    </section>
  );
}
