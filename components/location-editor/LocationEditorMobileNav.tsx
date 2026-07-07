"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { buildLocationEditorLinks } from "@/lib/location-editor-links";
import { cleanEditorHashNav, getCleanEditorActions } from "./editor-config";

type LocationEditorLinks = ReturnType<typeof buildLocationEditorLinks>;

export function dashboardRepairTitle(links: LocationEditorLinks) {
  return links.hasCanonicalId ? undefined : "Needs canonical locations.id repair";
}

export function dashboardRepairClass(links: LocationEditorLinks) {
  return links.hasCanonicalId ? "" : " border border-amber-400/40 bg-amber-400/10 text-amber-100";
}

export function getEditorNavSections(links: LocationEditorLinks) {
  return [
    ["Sections", cleanEditorHashNav],
    ["Quick Actions", getCleanEditorActions(links)],
  ] as const;
}

export default function LocationEditorMobileNav({ links, activeSectionId = "overview" }: { links: LocationEditorLinks; activeSectionId?: string }) {
  const [open, setOpen] = useState(false);
  const sections = getEditorNavSections(links);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl font-black text-white/80 transition hover:bg-white/[0.08] lg:hidden" aria-label="Open editor menu" aria-expanded={open} aria-controls="location-editor-mobile-menu">☰</button>
      {open ? (
        <div id="location-editor-mobile-menu" className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Location editor menu">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Close editor menu" onClick={() => setOpen(false)} />
          <aside className="relative z-10 h-full w-[min(86vw,340px)] overflow-y-auto border-r border-white/10 bg-[#050607] px-4 py-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3 px-3">
              <div><p className="text-sm font-black tracking-tight text-white"><span>The</span><span className="text-[#ff2142]">Out</span><span>Haven</span></p><h2 className="mt-2 text-xl font-black text-white">Location Editor</h2></div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg font-black text-white/80" aria-label="Close editor menu">×</button>
            </div>
            <nav className="space-y-6">
              {sections.map(([section, items]) => (
                <div key={section}>
                  <p className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">{section}</p>
                  <div className="mt-2 grid gap-1">
                    {items.map((item) => {
                      const active = "sectionId" in item && item.sectionId === activeSectionId;
                      return <Link key={`${section}-${item.label}`} href={item.href} onClick={() => setOpen(false)} className={`rounded-2xl px-3 py-2.5 text-sm font-bold transition hover:bg-white/[0.06] hover:text-white ${active ? "border border-[#ff2142]/35 bg-[#e1062a]/25 text-white" : "text-white/70"}`}>{item.label}</Link>;
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
