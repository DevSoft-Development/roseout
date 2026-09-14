"use client";

import { useMemo, useState } from "react";
import type { WebsiteV3PreviewArtifact } from "@/lib/websites/v3/artifact";

type Device = "desktop" | "tablet" | "mobile";

const WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet: "820px",
  mobile: "390px",
};

export function WebsiteV3Preview({ artifact, html, conceptName }: { artifact?: WebsiteV3PreviewArtifact; html?: WebsiteV3PreviewArtifact | string; conceptName: string }) {
  const resolved = artifact || (typeof html === "string" ? { defaultPage: "home", pages: [{ id: "home", label: "Home", path: "index.html", html }] } : html);
  if (!resolved) return null;
  return <WebsiteV3PreviewInner artifact={resolved} conceptName={conceptName} />;
}

function WebsiteV3PreviewInner({ artifact, conceptName }: { artifact: WebsiteV3PreviewArtifact; conceptName: string }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [pageId, setPageId] = useState(artifact.defaultPage);
  const page = useMemo(() => artifact.pages.find((item) => item.id === pageId) || artifact.pages[0], [artifact, pageId]);

  return (
    <section className="rounded-3xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Live V3 preview</p>
          <h3 className="mt-1 text-xl font-black">{conceptName}</h3>
          <p className="mt-1 text-xs text-white/45">Five-page preview rendered from the location&apos;s live business data. V3 publishing remains locked during visual QA.</p>
        </div>
        <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
          {(["desktop", "tablet", "mobile"] as Device[]).map((item) => (
            <button key={item} type="button" onClick={() => setDevice(item)} className={`rounded-full px-3 py-2 text-[11px] font-black capitalize transition ${device === item ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>{item}</button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {artifact.pages.map((item) => (
          <button key={item.id} type="button" onClick={() => setPageId(item.id)} className={`rounded-full border px-3 py-2 text-[11px] font-black transition ${page.id === item.id ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"}`}>{item.label}</button>
        ))}
      </div>
      <div className="overflow-auto rounded-2xl border border-white/10 bg-[#0a0a0a] p-2 sm:p-3">
        <iframe
          key={`${conceptName}-${page.id}`}
          title={`${conceptName} ${page.label} website preview`}
          srcDoc={page.html}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="mx-auto block min-h-[760px] rounded-xl bg-white shadow-2xl transition-[width] duration-300"
          style={{ width: WIDTHS[device], maxWidth: "100%", height: "78vh" }}
        />
      </div>
    </section>
  );
}
