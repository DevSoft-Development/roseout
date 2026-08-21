"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

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

function Step({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-white/25" />}
      <div>
        <p className="text-sm font-black text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-white/45">{detail}</p>
      </div>
    </div>
  );
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

  const addressesReady = Boolean(preview && preview.invalidAddressCount === 0);
  const stampsReady = Boolean(preview?.integration.configured && preview.integration.postcardEnabled);
  const readyToBuy = Boolean(addressesReady && preview?.quote.readyForPurchase && preview.integration.livePurchasesEnabled);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Postage</p>
            <h2 className="mt-2 text-2xl font-black">Prepare & buy postcard postage</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
              One simple workflow for every location in this batch. Restaurants, activities, and every other canonical TheOutHaven location use the same 4×6 postcard process.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || total === 0}
            onClick={() => void prepare()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Preparing…" : preview ? "Refresh postage check" : "Prepare postage"}
          </button>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Step done={Boolean(preview)} label="1. Check the batch" detail={`${total.toLocaleString()} location${total === 1 ? "" : "s"} will be checked for complete USPS mailing information.`} />
          <Step done={addressesReady} label="2. Validate addresses" detail={preview ? `${preview.validAddressCount.toLocaleString()} ready · ${preview.invalidAddressCount.toLocaleString()} need attention.` : "We verify the mailing address before any postage is purchased."} />
          <Step done={readyToBuy} label="3. Buy postage" detail={stampsReady ? "Postcard access is connected. Purchasing unlocks only when every address is ready." : "This unlocks automatically after Stamps.com credentials and postcard access are enabled."} />
        </div>

        {message ? <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}

        {preview ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Postcards", preview.quantity.toLocaleString()],
                ["Addresses ready", preview.validAddressCount.toLocaleString()],
                ["Postage each", money(preview.quote.unitPostageCents)],
                ["Total postage", money(preview.quote.totalPostageCents)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.15em] text-white/35">{label}</p>
                  <p className="mt-2 text-lg font-black">{value}</p>
                </div>
              ))}
            </div>

            {preview.invalidAddresses.length ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] p-4">
                <h3 className="font-black text-rose-100">Fix these addresses before buying postage</h3>
                <p className="mt-1 text-xs text-rose-100/60">Only the locations below need attention. The rest of the batch is ready.</p>
                <div className="mt-3 space-y-2">
                  {preview.invalidAddresses.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                      <p className="font-black text-white">{item.businessName}</p>
                      <p className="mt-1 text-rose-100/70">{item.warnings.join(" ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.06] p-4 text-sm text-emerald-50/75">
                All addresses in this batch are ready for the postage step.
              </div>
            )}

            {!stampsReady ? (
              <div className="rounded-2xl border border-amber-300/15 bg-amber-500/[0.06] p-4 text-sm text-amber-50/75">
                Waiting for the Stamps.com Integration ID and postcard API enablement. Nothing else needs to change in this workflow when those credentials arrive.
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black">4×6 USPS First-Class Postcard</p>
                <p className="mt-1 text-xs text-white/40">Stamps.com supplies the live rate and postage. TheOutHaven keeps the location, mailing address, claim code, QR tracking, and postage batch together.</p>
              </div>
              <button
                type="button"
                disabled={!readyToBuy}
                title={readyToBuy ? "Buy postage" : "Purchasing unlocks after Stamps.com is connected and all addresses validate."}
                className="h-12 shrink-0 rounded-xl bg-emerald-300 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
              >
                Buy postage & prepare print batch
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-white/35">Click Prepare postage. TheOutHaven handles the address check and postage readiness for the whole batch at once.</p>
        )}
      </div>
    </section>
  );
}
