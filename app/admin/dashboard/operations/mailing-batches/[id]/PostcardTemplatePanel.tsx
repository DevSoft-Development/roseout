"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TemplateState = {
  front: { ready: boolean; url: string };
  back: { ready: boolean; url: string };
  ready: boolean;
};

export default function PostcardTemplatePanel({ batchId }: { batchId: string }) {
  const [state, setState] = useState<TemplateState | null>(null);
  const [busy, setBusy] = useState<"front" | "back" | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/admin/mailing-batches/postcard-template", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not load postcard templates.");
      setState(data.templates as TemplateState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load postcard templates.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(side: "front" | "back", file: File | null) {
    if (!file) return;
    setBusy(side);
    setMessage("");
    try {
      const form = new FormData();
      form.set("side", side);
      form.set("file", file);
      const response = await fetch("/api/admin/mailing-batches/postcard-template", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not upload postcard template.");
      setState(data.templates as TemplateState);
      setMessage(`${side === "front" ? "Front" : "Back"} template saved. This version now applies to every mailing batch.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload postcard template.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-300/15 bg-emerald-500/[0.06] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200/70">Production artwork</p>
          <h2 className="mt-2 text-xl font-black text-emerald-50">4×6 postcard template</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/65">
            Upload the finalized mailing side and marketing side once. The same locked artwork is then used for every location, while the address, tracking QR, claim code, postage area, and sequence number stay dynamic.
          </p>
        </div>
        {state?.ready ? (
          <Link href={`/admin/dashboard/operations/mailing-batches/${batchId}/print`} className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">
            Open print center
          </Link>
        ) : (
          <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-100">Upload both sides to print</span>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(["front", "back"] as const).map((side) => {
          const template = state?.[side];
          return (
            <div key={side} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="font-black capitalize">{side === "front" ? "Front · mailing side" : "Back · marketing side"}</p>
                  <p className="mt-0.5 text-xs text-white/40">6 × 4 landscape · 3:2 artwork</p>
                </div>
                <span className={template?.ready ? "text-xs font-black text-emerald-200" : "text-xs font-black text-amber-200"}>
                  {template?.ready ? "Ready" : "Not uploaded"}
                </span>
              </div>
              {template?.ready ? (
                <div className="aspect-[3/2] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${template.url}?v=${Date.now()}`} alt={`${side} postcard template`} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex aspect-[3/2] items-center justify-center p-6 text-center text-sm text-white/35">Upload the finalized {side} artwork.</div>
              )}
              <label className="block cursor-pointer border-t border-white/10 px-4 py-3 text-center text-sm font-black text-white/75 hover:bg-white/[0.05]">
                {busy === side ? "Uploading…" : template?.ready ? `Replace ${side}` : `Upload ${side}`}
                <input
                  className="hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={Boolean(busy)}
                  onChange={(event) => void upload(side, event.target.files?.[0] || null)}
                />
              </label>
            </div>
          );
        })}
      </div>

      {message ? <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-white/70">{message}</p> : null}
    </section>
  );
}
