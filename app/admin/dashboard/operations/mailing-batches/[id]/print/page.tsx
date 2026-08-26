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
  searchParams?: Promise<{ mode?: string; staging?: string; item?: string }>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.mailingBatches);
  const { id } = await params;
  const query = (await searchParams) || {};
  const mode = ["fronts", "backs", "duplex"].includes(String(query.mode)) ? String(query.mode) : "duplex";
  const staging = query.staging === "1";
  const stagingItemId = typeof query.item === "string" ? query.item : "";

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
  let stagingPostageUrl: string | null = null;

  if (staging) {
    if (!stagingItemId) {
      return <PrintCenterMessage batchId={id} title="Staging postcard not selected" detail="Create a staging postage proof from the batch page first. The proof will load the exact test postcard into this print center." />;
    }

    const stagingItem = items.find((item) => item.id === stagingItemId);
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
    stagingPostageUrl = `${supabaseAdmin.storage.from(BUCKET).getPublicUrl(stagingPath).data.publicUrl}?v=${Date.now()}`;
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
      <PrintToolbar batchId={id} mode={mode} staging={staging} stagingItemId={stagingItemId} />

      {staging ? (
        <div className="print:hidden mx-auto mt-4 max-w-6xl px-4">
          <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50">
            <strong>STAGING TEST ONLY.</strong> This print center is showing one test postcard with Stamps.com staging postage loaded into the mailing side. Never place this card into the USPS mailstream. Destroy any printed copy immediately after testing.
          </div>
        </div>
      ) : null}

      <div className="print:hidden mx-auto max-w-6xl px-4 py-4 text-sm text-white/55">
        <strong className="text-white">{batch.name}</strong> · {renderItems.length.toLocaleString()} {staging ? "test card" : "cards"} · {mode === "duplex" ? "front/back pairs" : mode === "fronts" ? "fronts only" : "backs only"}. For duplex printing use 6×4 landscape, 100% scale, no margins, and flip on the short edge. For two-pass printing, keep the stack in sequence and verify the small matching number on both sides.
      </div>

      <div className="print-stack mx-auto w-fit">
        {pages.map((page, pageIndex) => (
          <article key={`${page.item.id}-${page.side}`} className="postcard-page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.side === "front" ? frontUrl : backUrl} alt="" className="template-image" />

            {page.side === "front" ? (
              <>
                {/* ATTN: OWNER / MANAGER is intentionally baked into the approved front master. */}
                {staging && stagingPostageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={stagingPostageUrl} alt="Staging postage" className="front-staging-postage" />
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
        .front-staging-postage {
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
