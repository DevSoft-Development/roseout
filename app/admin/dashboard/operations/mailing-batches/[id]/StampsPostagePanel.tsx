"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2, Printer } from "lucide-react";

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

type Connection = {
  ok: boolean;
  mode: string;
  accountStatus: string | null;
  availablePostage: number | null;
  message: string;
};

type StagingProof = {
  ok: true;
  businessName: string;
  cleansedAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    zip4?: string | null;
  };
  addressMatch: boolean;
  cityStateZipOk: boolean;
  amount: number;
  serviceType: string;
  packageType: string;
  shipDate: string;
  stampsTxId: string | null;
  integratorTxId: string;
  labelUrl: string | null;
  stagingAssetUrl?: string | null;
  sampleOnly: false;
  warning: string;
};

function money(cents: number | null) {
  if (cents == null) return "Pending Stamps.com";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dollars(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
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
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [proof, setProof] = useState<StagingProof | null>(null);
  const [message, setMessage] = useState("");

  async function testConnection() {
    setConnectionBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/mailing-batches/postage/connection", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || data.connection?.message || "Could not connect to Stamps.com.");
      setConnection(data.connection as Connection);
    } catch (error) {
      setConnection(null);
      setMessage(error instanceof Error ? error.message : "Could not connect to Stamps.com.");
    } finally {
      setConnectionBusy(false);
    }
  }

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

  async function runStagingProof() {
    setProofBusy(true);
    setMessage("");
    setProof(null);
    try {
      const response = await fetch(`/api/admin/mailing-batches/${batchId}/postage/staging-proof`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not create the staging postcard proof.");
      setProof(data.proof as StagingProof);
      setMessage("Staging postage was saved and is ready in the print center.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the staging postcard proof.");
    } finally {
      setProofBusy(false);
    }
  }

  const addressesReady = Boolean(preview && preview.invalidAddressCount === 0);
  const stampsReady = Boolean(connection?.ok || (preview?.integration.configured && preview.integration.postcardEnabled));
  const readyToBuy = Boolean(addressesReady && preview?.quote.readyForPurchase && preview.integration.livePurchasesEnabled);
  const canRunProof = Boolean(connection?.ok && connection.mode === "staging" && total > 0);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Postage</p>
            <h2 className="mt-2 text-2xl font-black">Prepare & buy postcard postage</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
              Connect to Stamps.com staging first, then prepare a controlled postcard test. Staging postage is test-only and must never be mailed.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={connectionBusy}
              onClick={() => void testConnection()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {connectionBusy ? "Connecting…" : connection ? "Retest Stamps connection" : "Test Stamps connection"}
            </button>
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
      </div>

      <div className="p-5 md:p-6">
        {connection ? (
          <div className="mb-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.07] p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <div>
                <p className="font-black text-emerald-100">Stamps.com staging connected</p>
                <p className="mt-1 text-sm text-emerald-50/70">{connection.message}</p>
                <p className="mt-2 text-xs text-emerald-50/55">Account: {connection.accountStatus || "Connected"} · Staging balance: {dollars(connection.availablePostage)}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Step done={Boolean(connection?.ok)} label="1. Connect Stamps.com" detail={connection?.ok ? "SWS/IM v160 staging authentication succeeded." : "Verify the server-side staging credentials before generating any test postage."} />
          <Step done={addressesReady} label="2. Check test addresses" detail={preview ? `${preview.validAddressCount.toLocaleString()} ready · ${preview.invalidAddressCount.toLocaleString()} need attention.` : "The batch is checked locally first. Bulk Stamps address cleansing waits for production access."} />
          <Step done={Boolean(proof?.ok)} label="3. Create one staging postcard" detail={proof?.ok ? "Single-card Stamps staging proof created and loaded into the print center." : "Runs CleanseAddress, GetRates, then one CreateMailingLabelIndicia call."} />
        </div>

        {message ? <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}

        {proof ? (
          <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-500/[0.08] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Staging proof created</p>
                <h3 className="mt-2 text-lg font-black text-amber-50">{proof.businessName}</h3>
                <p className="mt-2 text-sm text-amber-50/70">
                  {proof.cleansedAddress.street}, {proof.cleansedAddress.city}, {proof.cleansedAddress.state} {proof.cleansedAddress.zip}{proof.cleansedAddress.zip4 ? `-${proof.cleansedAddress.zip4}` : ""}
                </p>
                <p className="mt-2 text-xs text-amber-50/60">USPS First-Class Postcard · {dollars(proof.amount)} · SampleOnly=false · {proof.addressMatch ? "full address match" : "city/state/ZIP verified"}</p>
                <p className="mt-3 text-sm font-bold text-amber-100">{proof.warning}</p>
                <p className="mt-2 break-all text-[11px] text-amber-50/45">Stamps Tx: {proof.stampsTxId || "returned without transaction ID"} · TheOutHaven Tx: {proof.integratorTxId}</p>
              </div>
              {proof.labelUrl ? (
                <a
                  href={proof.labelUrl}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200/25 bg-amber-100 px-4 text-sm font-black text-black"
                >
                  Open in print center <Printer className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

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
                All addresses in this batch pass the local completeness check.
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/15 bg-amber-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-amber-50">Staging safety lock</p>
                <p className="mt-1 text-xs text-amber-50/65">This action uses only the first active postcard in the batch and creates one staging indicium. It cannot trigger a bulk purchase or mark the batch mailed.</p>
              </div>
              <button
                type="button"
                disabled={!canRunProof || proofBusy}
                onClick={() => void runStagingProof()}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-200 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
              >
                {proofBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {proofBusy ? "Creating test…" : proof ? "Create another staging proof" : "Create one staging postcard"}
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black">Production postage</p>
                <p className="mt-1 text-xs text-white/40">Bulk address cleansing and live postcard purchasing stay disabled until Stamps.com production approval.</p>
              </div>
              <button
                type="button"
                disabled={!readyToBuy}
                className="h-12 shrink-0 rounded-xl bg-emerald-300 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
              >
                Buy postage & prepare print batch
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">Start with Test Stamps connection, then Prepare postage. The staging proof button unlocks after the connection succeeds.</p>
            <button
              type="button"
              disabled={!canRunProof || proofBusy}
              onClick={() => void runStagingProof()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-200 px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
            >
              {proofBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {proofBusy ? "Creating test…" : "Create one staging postcard"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
