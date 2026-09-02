"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2, Printer } from "lucide-react";

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
  cleansedAddress: { street: string; city: string; state: string; zip: string; zip4?: string | null };
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

type ProductionProof = {
  businessName: string;
  cleansedAddress: { street: string; city: string; state: string; zip: string; zip4?: string | null };
  addressMatch: boolean;
  cityStateZipOk: boolean;
  amount: number;
  serviceType: string;
  packageType: string;
  shipDate: string;
  stampsTxId: string | null;
  integratorTxId: string;
  postageAssetUrl: string | null;
  assetWarning: string | null;
  sampleOnly: false;
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
  const [productionBusy, setProductionBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [proof, setProof] = useState<StagingProof | null>(null);
  const [productionProof, setProductionProof] = useState<ProductionProof | null>(null);
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

  async function runProductionProof() {
    const confirmed = window.confirm(
      "This will create ONE live USPS postcard indicium and charge the production Stamps.com account. It will not buy postage for the rest of the batch. Continue?",
    );
    if (!confirmed) return;

    setProductionBusy(true);
    setMessage("");
    setProductionProof(null);
    try {
      const response = await fetch(`/api/admin/mailing-batches/${batchId}/postage/production-proof`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const suffix = data.requiresManualReview ? " Do not retry this postcard until the transaction is reviewed." : "";
        throw new Error(`${data.error || "Could not create the controlled production postcard."}${suffix}`);
      }
      setProductionProof(data.proof as ProductionProof);
      setMessage("One live postcard indicium was purchased. Verify the rate, image, dimensions, and final placement before enabling any batch purchase path.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the controlled production postcard.");
    } finally {
      setProductionBusy(false);
    }
  }

  const addressesReady = Boolean(preview && preview.invalidAddressCount === 0);
  const isLive = connection?.mode === "live" || preview?.integration.mode === "live";
  const canRunStagingProof = Boolean(connection?.ok && connection.mode === "staging" && total > 0);
  const canRunProductionProof = Boolean(
    connection?.ok
      && connection.mode === "live"
      && addressesReady
      && preview?.integration.configured
      && preview.integration.postcardEnabled
      && preview.integration.livePurchasesEnabled
      && total > 0,
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Postage</p>
            <h2 className="mt-2 text-2xl font-black">Prepare postcard postage</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
              SWS/IM v160 production is approved. Live postage stays behind a server-side purchase switch and a one-card controlled proof before any batch workflow is enabled.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={connectionBusy} onClick={() => void testConnection()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
              {connectionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {connectionBusy ? "Connecting…" : connection ? "Retest Stamps connection" : "Test Stamps connection"}
            </button>
            <button type="button" disabled={busy || total === 0} onClick={() => void prepare()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50">
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
                <p className="font-black text-emerald-100">Stamps.com {connection.mode === "live" ? "production" : "staging"} connected</p>
                <p className="mt-1 text-sm text-emerald-50/70">{connection.message}</p>
                <p className="mt-2 text-xs text-emerald-50/55">Account: {connection.accountStatus || "Connected"} · Available postage: {dollars(connection.availablePostage)}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Step done={Boolean(connection?.ok)} label="1. Connect Stamps.com" detail={connection?.ok ? `SWS/IM v160 ${connection.mode} authentication succeeded.` : "Verify server-side Stamps.com credentials before generating postage."} />
          <Step done={addressesReady} label="2. Check addresses" detail={preview ? `${preview.validAddressCount.toLocaleString()} ready · ${preview.invalidAddressCount.toLocaleString()} need attention.` : "Run the batch address completeness check before any indicium request."} />
          <Step done={Boolean(isLive ? productionProof : proof)} label={isLive ? "3. Create one live postcard" : "3. Create one staging postcard"} detail={isLive ? (productionProof ? "One production indicium purchased with persistent duplicate protection." : "One live charge only; verify it before any batch purchasing.") : (proof ? "Single-card staging proof created and loaded into the print center." : "Runs CleanseAddress, GetRates, then one CreateMailingLabelIndicia call.")} />
        </div>

        {message ? <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}

        {productionProof ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-500/[0.08] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Live production postage purchased</p>
                <h3 className="mt-2 text-lg font-black text-emerald-50">{productionProof.businessName}</h3>
                <p className="mt-2 text-sm text-emerald-50/70">{productionProof.cleansedAddress.street}, {productionProof.cleansedAddress.city}, {productionProof.cleansedAddress.state} {productionProof.cleansedAddress.zip}{productionProof.cleansedAddress.zip4 ? `-${productionProof.cleansedAddress.zip4}` : ""}</p>
                <p className="mt-2 text-xs text-emerald-50/65">USPS First-Class Postcard · {dollars(productionProof.amount)} · {productionProof.packageType} · ship date {productionProof.shipDate}</p>
                <p className="mt-2 break-all text-[11px] text-emerald-50/45">Stamps Tx: {productionProof.stampsTxId || "returned without transaction ID"} · TheOutHaven Tx: {productionProof.integratorTxId}</p>
                {productionProof.assetWarning ? <p className="mt-3 text-sm font-bold text-amber-200">{productionProof.assetWarning} Do not retry the postage purchase.</p> : null}
              </div>
              {productionProof.postageAssetUrl ? (
                <a href={productionProof.postageAssetUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-200 px-4 text-sm font-black text-black">
                  Inspect live indicium <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {proof ? (
          <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-500/[0.08] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Staging proof created</p>
                <h3 className="mt-2 text-lg font-black text-amber-50">{proof.businessName}</h3>
                <p className="mt-2 text-sm text-amber-50/70">{proof.cleansedAddress.street}, {proof.cleansedAddress.city}, {proof.cleansedAddress.state} {proof.cleansedAddress.zip}{proof.cleansedAddress.zip4 ? `-${proof.cleansedAddress.zip4}` : ""}</p>
                <p className="mt-2 text-xs text-amber-50/60">USPS First-Class Postcard · {dollars(proof.amount)} · SampleOnly=false</p>
                <p className="mt-3 text-sm font-bold text-amber-100">{proof.warning}</p>
              </div>
              {proof.labelUrl ? <a href={proof.labelUrl} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200/25 bg-amber-100 px-4 text-sm font-black text-black">Open in print center <Printer className="h-4 w-4" /></a> : null}
            </div>
          </div>
        ) : null}

        {preview ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[["Postcards", preview.quantity.toLocaleString()], ["Addresses ready", preview.validAddressCount.toLocaleString()], ["Postage each", money(preview.quote.unitPostageCents)], ["Total postage", money(preview.quote.totalPostageCents)]].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-black uppercase tracking-[0.15em] text-white/35">{label}</p><p className="mt-2 text-lg font-black">{value}</p></div>
              ))}
            </div>

            {preview.invalidAddresses.length ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] p-4">
                <h3 className="font-black text-rose-100">Fix these addresses before buying postage</h3>
                <div className="mt-3 space-y-2">{preview.invalidAddresses.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm"><p className="font-black text-white">{item.businessName}</p><p className="mt-1 text-rose-100/70">{item.warnings.join(" ")}</p></div>)}</div>
              </div>
            ) : <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.06] p-4 text-sm text-emerald-50/75">All addresses in this batch pass the local completeness check.</div>}

            {isLive ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-emerald-50">Controlled production proof</p>
                  <p className="mt-1 text-xs text-emerald-50/65">Charges exactly one live postcard. A database reservation is written first; any ambiguous failure is locked for manual review and cannot be retried automatically.</p>
                </div>
                <button type="button" disabled={!canRunProductionProof || productionBusy || Boolean(productionProof)} onClick={() => void runProductionProof()} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-200 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35">
                  {productionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {productionBusy ? "Purchasing one…" : productionProof ? "Production proof completed" : "Purchase one live postcard"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/15 bg-amber-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-black text-amber-50">Staging safety lock</p><p className="mt-1 text-xs text-amber-50/65">Uses only the first active postcard and cannot trigger a bulk purchase or mark the batch mailed.</p></div>
                <button type="button" disabled={!canRunStagingProof || proofBusy} onClick={() => void runStagingProof()} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-200 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35">{proofBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{proofBusy ? "Creating test…" : "Create one staging postcard"}</button>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-black">Batch production purchasing remains locked</p>
              <p className="mt-1 text-xs leading-5 text-white/45">After the one-card production proof is verified for rate, indicium, dimensions, and final layout, batch purchasing can be enabled as a separate controlled rollout. This page does not automatically charge the remaining postcards.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/45">Start with Test Stamps connection, then Prepare postage. Live purchasing stays locked until the production configuration and explicit purchase switch are both enabled server-side.</div>
        )}
      </div>
    </section>
  );
}
