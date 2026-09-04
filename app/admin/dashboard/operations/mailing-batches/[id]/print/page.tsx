import Link from "next/link";
import QRCode from "qrcode";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { buildShortLinkUrl } from "@/lib/outings/short-links";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";
import PrintToolbar from "./PrintToolbar";

export const dynamic = "force-dynamic";

const BUCKET = "postcard-templates";

type BatchItem = {
  id: string;
  sequence_number: number;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  claim_code: string | null;
  tracking_token: string;
};

type RenderPage = {
  side: "front" | "back";
  item: BatchItem;
  qr?: string;
};

function sequence(value: number) {
  return String(value).padStart(4, "0");
}

function cityLine(item: BatchItem) {
  const city = String(item.city || "").trim();
  const state = String(item.state || "").trim();
  const zip = String(item.zip_code || "").trim();
  return `${city}${city && state ? ", " : ""}${state}${zip ? ` ${zip}` : ""}`.trim();
}

function PrintCenterMessage({ batchId, title, detail }: { batchId: string; title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-[#080706] p-8 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-amber-300/20 bg-amber-500/10 p-6">
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/65">{detail}</p>
        <Link href={`/admin/dashboard/operations/mailing-batches/${batchId}`} className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">Back to batch</Link>
      </div>
    </main>
  );
}

export default async function MailingBatchPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string; staging?: string; production?: string; productionBatch?: string; item?: string }>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.mailingBatches);
  const { id } = await params;
  const query = (await searchParams) || {};
  const mode = ["fronts", "backs", "duplex"].includes(String(query.mode)) ? String(query.mode) : "duplex";
  const staging = query.staging === "1";
  const production = query.production === "1";
  const productionBatch = query.productionBatch === "1";
  const proofItemId = typeof query.item === "string" ? query.item : "";
  if ([staging, production, productionBatch].filter(Boolean).length > 1) {
    return <PrintCenterMessage batchId={id} title="Choose one postage proof mode" detail="Staging, single-card production, and purchased-batch production modes cannot be mixed on the same print request." />;
  }

  const [{ data: batch, error: batchError }, { data: itemData, error: itemError }, { data: templateObjects, error: templateError }] = await Promise.all([
    supabaseAdmin.from("mailing_batches").select("id,name,status").eq("id", id).maybeSingle(),
    supabaseAdmin
      .from("mailing_batch_items")
      .select("id,sequence_number,business_name,street_address,city,state,zip_code,claim_code,tracking_token")
      .eq("batch_id", id)
      .not("status", "eq", "cancelled")
      .order("sequence_number", { ascending: true })
      .limit(1000),
    supabaseAdmin.storage.from(BUCKET).list("", { limit: 100 }),
  ]);

  if (batchError || itemError || templateError) {
    throw new Error(batchError?.message || itemError?.message || templateError?.message || "Could not prepare postcard print center.");
  }

  if (!batch) {
    return <PrintCenterMessage batchId={id} title="Mailing batch not found" detail="This mailing batch is no longer available." />;
  }

  const templateNames = new Set((templateObjects || []).map((entry) => entry.name));
  const templatesReady = templateNames.has("claim-front") && templateNames.has("claim-back");
  if (!templatesReady) {
    return <PrintCenterMessage batchId={id} title="Upload both postcard sides first" detail="The print center uses the locked production artwork uploaded from the mailing batch page. Upload the finalized front and back, then return here." />;
  }

  const items = (itemData || []) as BatchItem[];
  let renderItems = items;
  const postageUrlByItem = new Map<string, string>();

  if (staging) {
    if (!proofItemId) {
      return <PrintCenterMessage batchId={id} title="Staging postcard not selected" detail="Create a staging postage proof from the batch page first. The proof will load the exact test postcard into this print center." />;
    }

    const stagingItem = items.find((item) => item.id === proofItemId);
    if (!stagingItem) {
      return <PrintCenterMessage batchId={id} title="Staging postcard not found" detail="The postcard used for this staging proof is no longer active in this batch. Create a new staging proof from the batch page." />;
    }

    const stagingFolder = `staging-proofs/${id}`;
    const stagingFile = `${stagingItem.id}.png`;
    const { data: stagingObjects, error: stagingError } = await supabaseAdmin.storage.from(BUCKET).list(stagingFolder, { limit: 100, search: stagingFile });
    if (stagingError) throw new Error(stagingError.message || "Could not load staging postage.");
    if (!(stagingObjects || []).some((entry) => entry.name === stagingFile)) {
      return <PrintCenterMessage batchId={id} title="Create staging postage first" detail="No saved staging postage image was found for this postcard. Return to the batch page and create one staging postcard again." />;
    }

    renderItems = [stagingItem];
    const stagingPath = `${stagingFolder}/${stagingFile}`;
    postageUrlByItem.set(stagingItem.id, `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(stagingPath).data.publicUrl}?v=${Date.now()}`);
  }

  if (production) {
    if (!proofItemId) {
      return <PrintCenterMessage batchId={id} title="Production postcard not selected" detail="A live production proof must identify the exact purchased postcard before it can be rendered." />;
    }
    const productionItem = items.find((item) => item.id === proofItemId);
    if (!productionItem) {
      return <PrintCenterMessage batchId={id} title="Production postcard not found" detail="The purchased postcard is no longer active in this batch. Review the transaction before printing anything." />;
    }
    const { data: purchaseRow, error: purchaseError } = await supabaseAdmin
      .from("mailing_batch_items")
      .select("stamps_postage_status,stamps_tx_id,stamps_integrator_tx_id,stamps_postage_purchased_at")
      .eq("id", productionItem.id)
      .eq("batch_id", id)
      .maybeSingle();
    if (purchaseError) throw new Error(purchaseError.message || "Could not verify purchased postage state.");
    if (
      !purchaseRow
      || purchaseRow.stamps_postage_status !== "purchased"
      || !purchaseRow.stamps_postage_purchased_at
      || !purchaseRow.stamps_integrator_tx_id
      || !purchaseRow.stamps_tx_id
    ) {
      return <PrintCenterMessage batchId={id} title="Live postage is not verified as purchased" detail="This print mode fails closed unless the exact postcard has a persisted purchased transaction. Do not retry a live Stamps.com request from the print center." />;
    }
    const productionFolder = `production-proofs/${id}`;
    const productionFile = `${productionItem.id}.png`;
    const { data: productionObjects, error: productionError } = await supabaseAdmin.storage.from(BUCKET).list(productionFolder, { limit: 100, search: productionFile });
    if (productionError) throw new Error(productionError.message || "Could not load production postage.");
    if (!(productionObjects || []).some((entry) => entry.name === productionFile)) {
      return <PrintCenterMessage batchId={id} title="Purchased postage image needs manual review" detail="The live purchase record exists, but the saved indicium image is missing. Do not purchase this postcard again. Resolve the existing transaction before printing." />;
    }
    renderItems = [productionItem];
    const productionPath = `${productionFolder}/${productionFile}`;
    postageUrlByItem.set(productionItem.id, `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(productionPath).data.publicUrl}?v=${Date.now()}`);
  }

  if (productionBatch) {
    if (!items.length) {
      return <PrintCenterMessage batchId={id} title="No postcards are available" detail="This mailing batch has no active postcards to render." />;
    }

    const { data: purchaseRows, error: purchaseError } = await supabaseAdmin
      .from("mailing_batch_items")
      .select("id,stamps_postage_status,stamps_tx_id,stamps_integrator_tx_id,stamps_postage_purchased_at")
      .eq("batch_id", id)
      .in("id", items.map((item) => item.id));
    if (purchaseError) throw new Error(purchaseError.message || "Could not verify purchased batch postage state.");

    const purchaseByItem = new Map((purchaseRows || []).map((row) => [String(row.id), row]));
    const unverified = items.filter((item) => {
      const row = purchaseByItem.get(item.id);
      return !row
        || row.stamps_postage_status !== "purchased"
        || !row.stamps_postage_purchased_at
        || !row.stamps_integrator_tx_id
        || !row.stamps_tx_id;
    });
    if (unverified.length) {
      return <PrintCenterMessage batchId={id} title="Purchased batch is not ready to print" detail={`${unverified.length.toLocaleString()} active postcard${unverified.length === 1 ? " is" : "s are"} not verified as purchased. This mode fails closed and will not create or retry postage.`} />;
    }

    const productionFolder = `production-proofs/${id}`;
    const { data: productionObjects, error: productionError } = await supabaseAdmin.storage.from(BUCKET).list(productionFolder, { limit: 1000 });
    if (productionError) throw new Error(productionError.message || "Could not load purchased batch postage images.");
    const productionNames = new Set((productionObjects || []).map((entry) => entry.name));
    const missingAssets = items.filter((item) => !productionNames.has(`${item.id}.png`));
    if (missingAssets.length) {
      return <PrintCenterMessage batchId={id} title="Purchased batch postage images need review" detail={`${missingAssets.length.toLocaleString()} purchased postcard${missingAssets.length === 1 ? " is" : "s are"} missing a saved indicium image. Do not purchase those postcards again; review the existing transactions first.`} />;
    }

    renderItems = items;
    for (const item of renderItems) {
      const productionPath = `${productionFolder}/${item.id}.png`;
      postageUrlByItem.set(item.id, `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(productionPath).data.publicUrl}?v=${Date.now()}`);
    }
  }

  const frontUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-front").data.publicUrl;
  const backUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-back").data.publicUrl;
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const qrByItem = new Map<string, string>();

  // New batches register a stable outhvn.com link when they are created.
  // Existing batches intentionally fall back to their original tracking URL so
  // no previously issued or printed postcard link is invalidated.
  const itemIds = renderItems.map((item) => item.id);
  const shortUrlByItem = new Map<string, string>();
  if (itemIds.length) {
    const { data: shortRows, error: shortError } = await supabaseAdmin
      .from("short_links")
      .select("entity_id,code")
      .eq("link_type", "postcard")
      .eq("entity_type", "mailing_batch_item")
      .eq("is_active", true)
      .in("entity_id", itemIds);
    if (!shortError) {
      for (const row of shortRows || []) {
        if (row.entity_id && row.code) shortUrlByItem.set(String(row.entity_id), buildShortLinkUrl(String(row.code)));
      }
    }
  }

  if (mode !== "fronts") {
    const qrs = await Promise.all(
      renderItems.map(async (item) => {
        const target = shortUrlByItem.get(item.id) || `${siteUrl}/postcard/claim/${item.tracking_token}`;
        return [
          item.id,
          await QRCode.toDataURL(target, {
            width: 700,
            margin: 1,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
          }),
        ] as const;
      }),
    );
    qrs.forEach(([itemId, qr]) => qrByItem.set(itemId, qr));
  }

  const pages: RenderPage[] = [];
  for (const item of renderItems) {
    if (mode === "fronts") pages.push({ side: "front", item });
    else if (mode === "backs") pages.push({ side: "back", item, qr: qrByItem.get(item.id) });
    else {
      pages.push({ side: "front", item });
      pages.push({ side: "back", item, qr: qrByItem.get(item.id) });
    }
  }

  return (
    <main className="min-h-screen bg-[#111]">
      <PrintToolbar batchId={id} mode={mode} staging={staging} production={production} productionBatch={productionBatch} proofItemId={proofItemId} />

      {staging ? (
        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4"><div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50"><strong>STAGING TEST ONLY.</strong> This print center is showing one test postcard with Stamps.com staging postage loaded into the mailing side. Never place this card into the USPS mailstream. Destroy any printed copy immediately after testing.</div></div>
      ) : null}
      {production ? (
        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4"><div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-50"><strong>LIVE POSTAGE — ONE PURCHASED CARD.</strong> This page renders only the exact postcard whose transaction is persisted as purchased and whose saved indicium image exists. Verify 6×4 physical size, postage placement, address clearance, and duplex orientation before mailing it.</div></div>
      ) : null}
      {productionBatch ? (
        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4"><div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-50"><strong>LIVE POSTAGE — PURCHASED BATCH.</strong> Every active postcard on this page is persisted as purchased and matched to its own saved indicium image. This print view cannot buy or retry postage. Verify front/back sequence numbers, 6×4 size, short-edge duplex orientation, and indicium placement before mailing.</div></div>
      ) : null}

      <div className="print:hidden mx-auto max-w-6xl px-4 py-4 text-sm text-white/55">
        <strong className="text-white">{batch.name}</strong> · {renderItems.length.toLocaleString()} {staging ? "test card" : production ? "live proof card" : productionBatch ? "purchased live cards" : "cards"} · {mode === "duplex" ? "front/back pairs" : mode === "fronts" ? "fronts only" : "backs only"}. For duplex printing use 6×4 landscape, 100% scale, no margins, and flip on the short edge. For two-pass printing, keep the stack in sequence and verify the small matching number on both sides.
      </div>

      <div className="print-stack mx-auto w-fit">
        {pages.map((page, pageIndex) => (
          <article key={`${page.item.id}-${page.side}`} className="postcard-page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.side === "front" ? frontUrl : backUrl} alt="" className="template-image" />

            {page.side === "front" ? (
              <>
                {/* ATTN: OWNER / MANAGER is intentionally baked into the approved front master. */}
                {postageUrlByItem.get(page.item.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={postageUrlByItem.get(page.item.id)} alt={(production || productionBatch) ? "Live production postage" : "Staging postage"} className="front-proof-postage" />
                ) : null}
                <div className="front-address">
                  <div className="front-business">{page.item.business_name}</div>
                  <div className="front-street">{page.item.street_address || ""}</div>
                  <div className="front-city">{cityLine(page.item)}</div>
                </div>
                <div className="front-sequence">{sequence(page.item.sequence_number)}</div>
              </>
            ) : (
              <>
                {page.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.qr} alt="Tracking QR" className="back-qr" />
                ) : null}
                <div className="back-claim-code">{page.item.claim_code || ""}</div>
                <div className="back-sequence">{sequence(page.item.sequence_number)}</div>
              </>
            )}
            {staging ? <div className="staging-print-warning">STAGING TEST ONLY · DO NOT MAIL</div> : null}
            <span className="print:hidden page-debug">{pageIndex + 1}</span>
          </article>
        ))}
      </div>

      <style>{`
        .postcard-page {
          position: relative;
          width: 6in;
          height: 4in;
          overflow: hidden;
          background: white;
          break-after: page;
          page-break-after: always;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .postcard-page:last-child { break-after: auto; page-break-after: auto; }
        .template-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }

        /* Approved 1800×1200 front master. ATTN line and postage-box outline are baked into the artwork. */
        .front-proof-postage {
          position: absolute;
          z-index: 4;
          right: 0.16in;
          top: 0.06in;
          width: 1.30in;
          height: 0.82in;
          object-fit: contain;
          object-position: center;
          background: white;
          box-shadow: 0 0 0 0.03in white;
        }
        .front-address {
          position: absolute;
          z-index: 3;
          left: 59.15%;
          top: 52.15%;
          width: 34.0%;
          max-height: 17.0%;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.15;
          overflow: hidden;
        }
        .front-business {
          max-width: 100%;
          font-size: 0.135in;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: 0.002in;
          overflow-wrap: break-word;
          word-break: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .front-street {
          margin-top: 0.045in;
          max-width: 100%;
          font-size: 0.102in;
          font-weight: 500;
          line-height: 1.12;
          overflow-wrap: break-word;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .front-city {
          margin-top: 0.035in;
          max-width: 100%;
          font-size: 0.102in;
          font-weight: 500;
          line-height: 1.12;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: clip;
        }
        .front-sequence {
          position: absolute;
          z-index: 3;
          left: 2.0%;
          top: 94.0%;
          font: 600 0.055in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.008in;
          color: rgba(70,70,70,.42);
        }

        /* Final 1800×1200 3-step back master. QR and claim-code boxes are intentionally blank in the artwork. */
        .back-qr {
          position: absolute;
          z-index: 3;
          left: 74.0%;
          top: 21.15%;
          width: 1.30in;
          height: 1.30in;
          object-fit: contain;
          image-rendering: auto;
        }
        .back-claim-code {
          position: absolute;
          z-index: 3;
          left: 74.0%;
          top: 62.45%;
          width: 21.7%;
          height: 7.25%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: #111;
          font: 800 0.170in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.018in;
          white-space: nowrap;
        }
        .back-sequence {
          position: absolute;
          z-index: 3;
          left: 1.5%;
          top: 97.0%;
          font: 600 0.045in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.008in;
          color: rgba(255,255,255,.38);
        }
        .staging-print-warning {
          position: absolute;
          z-index: 20;
          left: 50%;
          bottom: 0.03in;
          transform: translateX(-50%);
          border: 1px solid rgba(180, 50, 40, .7);
          background: rgba(255,255,255,.92);
          padding: 0.025in 0.06in;
          color: #9f1d16;
          font: 800 0.07in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.008in;
          white-space: nowrap;
        }
        .page-debug { position: absolute; right: 4px; bottom: 4px; z-index: 10; border-radius: 999px; background: rgba(0,0,0,.72); padding: 2px 5px; font: 10px Arial; color: white; }
        @page { size: 6in 4in; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .print-stack { margin: 0 !important; width: 6in !important; }
        }
      `}</style>
    </main>
  );
}
