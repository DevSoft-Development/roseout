"use client";

import { useState } from "react";

type Preview = {
  success: boolean;
  postcardSize: string;
  quantity: number;
  validAddressCount: number;
  invalidAddressCount: number;
  invalidAddresses: Array<{ id: string; businessName: string; warnings: string[] }>;
  quote: {
    mailClass: string;
    packageType: string;
    unitPostageCents: number | null;
    totalPostageCents: number | null;
    readyForPurchase: boolean;
    note: string;
  };
  integration: {
    mode: string;
    configured: boolean;
    postcardEnabled: boolean;
    livePurchasesEnabled: boolean;
  };
};

function money(cents: number | null) {
  if (cents == null) return "Pending Stamps.com";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function StampsPostagePanel({ batchId, total }: { batchId: string; total: number }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");

  async function prepare() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/mailing-batches/${batchId}/postage/preview`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not prepare postage.");
      setPreview(data as Preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare postage.");
    } finally {
      setBusy(false);
    }
  }

  const ready = preview?.quote.readyForPurchase && preview.invalidAddressCount === 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Postage</p>
          <h2 className="mt-2 text-xl font-black">Stamps.com · 4×6 First-Class Postcards</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
            Validate every mailing address and prepare the USPS postcard-rate quote before postage is purchased. No postage is purchased from this screen until the Stamps.com account is connected and live purchasing is explicitly enabled.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || total === 0}
          onClick={() => void prepare()}
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Checking addresses…" : preview ? "Refresh postage preview" : "Prepare postage"}
        </button>
      </div>

      {message ? <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}

      {preview ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Cards", preview.quantity.toLocaleString()],
              ["Valid addresses", preview.validAddressCount.toLocaleString()],
              ["Needs attention", preview.invalidAddressCount.toLocaleString()],
              ["Postage each", money(preview.quote.unitPostageCents)],
              ["Estimated postage", money(preview.quote.totalPostageCents)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.15em] text-white/35">{label}</p>
                <p className="mt-2 text-lg font-black">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/60">{preview.quote.mailClass}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/60">Package type: {preview.quote.packageType}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-white/60">Mode: {preview.integration.mode}</span>
            <span className={preview.integration.configured
              ? "rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100"
              : "rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-amber-100"}
            >
              {preview.integration.configured ? "Credentials connected" : "Waiting for Integration ID"}
            </span>
          </div>

          <div className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.06] p-4 text-sm text-amber-50/75">
            {preview.quote.note}
          </div>

          {preview.invalidAddresses.length ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] p-4">
              <h3 className="font-black text-rose-100">Addresses that need attention</h3>
              <div className="mt-3 space-y-2">
                {preview.invalidAddresses.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                    <p className="font-black text-white">{item.businessName}</p>
                    <p className="mt-1 text-rose-100/70">{item.warnings.join(" ")}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!ready}
            title={ready ? "Buy postage" : "Postage purchasing will unlock after Stamps.com confirms postcard API access and all addresses validate."}
            className="rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
          >
            Buy postage & prepare print batch
          </button>
        </div>
      ) : null}
    </section>
  );
}
