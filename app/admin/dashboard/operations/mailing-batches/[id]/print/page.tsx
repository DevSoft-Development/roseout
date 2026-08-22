import Link from "next/link";
import QRCode from "qrcode";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
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

export default async function MailingBatchPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.mailingBatches);
  const { id } = await params;
  const query = (await searchParams) || {};
  const mode = ["fronts", "backs", "duplex"].includes(String(query.mode)) ? String(query.mode) : "duplex";

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
    return (
      <main className="min-h-screen bg-[#080706] p-8 text-white">
        <p>Mailing batch not found.</p>
      </main>
    );
  }

  const templateNames = new Set((templateObjects || []).map((entry) => entry.name));
  const templatesReady = templateNames.has("claim-front") && templateNames.has("claim-back");
  if (!templatesReady) {
    return (
      <main className="min-h-screen bg-[#080706] p-8 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-amber-300/20 bg-amber-500/10 p-6">
          <h1 className="text-2xl font-black">Upload both postcard sides first</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">The print center uses the locked production artwork uploaded from the mailing batch page. Upload the finalized front and back, then return here.</p>
          <Link href={`/admin/dashboard/operations/mailing-batches/${id}`} className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">Back to batch</Link>
        </div>
      </main>
    );
  }

  const items = (itemData || []) as BatchItem[];
  const frontUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-front").data.publicUrl;
  const backUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-back").data.publicUrl;
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const qrByItem = new Map<string, string>();

  if (mode !== "fronts") {
    const qrs = await Promise.all(
      items.map(async (item) => [
        item.id,
        await QRCode.toDataURL(`${siteUrl}/postcard/claim/${item.tracking_token}`, {
          width: 700,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        }),
      ] as const),
    );
    qrs.forEach(([itemId, qr]) => qrByItem.set(itemId, qr));
  }

  const pages: RenderPage[] = [];
  for (const item of items) {
    if (mode === "fronts") pages.push({ side: "front", item });
    else if (mode === "backs") pages.push({ side: "back", item, qr: qrByItem.get(item.id) });
    else {
      pages.push({ side: "front", item });
      pages.push({ side: "back", item, qr: qrByItem.get(item.id) });
    }
  }

  return (
    <main className="min-h-screen bg-[#111]">
      <PrintToolbar batchId={id} mode={mode} />
      <div className="print:hidden mx-auto max-w-6xl px-4 py-4 text-sm text-white/55">
        <strong className="text-white">{batch.name}</strong> · {items.length.toLocaleString()} cards · {mode === "duplex" ? "front/back pairs" : mode === "fronts" ? "fronts only" : "backs only"}. For duplex printing use 6×4 landscape, 100% scale, no margins, and flip on the short edge. For two-pass printing, keep the stack in sequence and verify the small matching number on both sides.
      </div>

      <div className="print-stack mx-auto w-fit">
        {pages.map((page, pageIndex) => (
          <article key={`${page.item.id}-${page.side}`} className="postcard-page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.side === "front" ? frontUrl : backUrl} alt="" className="template-image" />

            {page.side === "front" ? (
              <>
                {/* These masks keep sample/template text out of production output even if an older image is still cached. */}
                <div className="front-address-mask" aria-hidden="true" />
                <div className="front-postage-mask" aria-hidden="true" />
                <div className="front-postal-clear-zone" aria-hidden="true" />

                <div className="front-address">
                  <div className="front-attention">ATTN: OWNER / MANAGER</div>
                  <div className="front-business">{page.item.business_name}</div>
                  <div className="front-street">{page.item.street_address || ""}</div>
                  <div className="front-city">{cityLine(page.item)}</div>
                </div>
                <div className="front-sequence">{sequence(page.item.sequence_number)}</div>
              </>
            ) : (
              <>
                <div className="back-qr-mask" aria-hidden="true" />
                <div className="back-claim-mask" aria-hidden="true" />
                {page.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.qr} alt="Tracking QR" className="back-qr" />
                ) : null}
                <div className="back-claim-code">{page.item.claim_code || ""}</div>
                <div className="back-sequence">{sequence(page.item.sequence_number)}</div>
              </>
            )}
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

        /*
         * New locked front master geometry.
         * The masks deliberately erase any baked sample recipient/postage text from older uploads.
         */
        .front-address-mask {
          position: absolute;
          z-index: 2;
          left: 57.5%;
          top: 50.0%;
          width: 36.0%;
          height: 30.0%;
          background: #fff;
        }
        .front-postage-mask {
          position: absolute;
          z-index: 2;
          left: 88.0%;
          top: 3.0%;
          width: 10.5%;
          height: 18.5%;
          background: #fff;
        }
        /* USPS barcode clear zone: lower-right 4.75in × 0.625in on a 6×4 card. */
        .front-postal-clear-zone {
          position: absolute;
          z-index: 2;
          left: 20.8333%;
          top: 84.375%;
          width: 79.1667%;
          height: 15.625%;
          background: #fff;
        }
        .front-address {
          position: absolute;
          z-index: 3;
          left: 59.0%;
          top: 57.0%;
          width: 33.0%;
          max-height: 24.5%;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.15;
          overflow: hidden;
        }
        .front-attention {
          max-width: 100%;
          font-size: 0.080in;
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0.003in;
          white-space: nowrap;
        }
        .front-business {
          margin-top: 0.055in;
          max-width: 100%;
          font-size: 0.140in;
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
          margin-top: 0.055in;
          max-width: 100%;
          font-size: 0.100in;
          font-weight: 500;
          line-height: 1.12;
          overflow-wrap: break-word;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .front-city {
          margin-top: 0.045in;
          max-width: 100%;
          font-size: 0.100in;
          font-weight: 500;
          line-height: 1.12;
          overflow-wrap: break-word;
          white-space: nowrap;
        }
        .front-sequence {
          position: absolute;
          z-index: 3;
          left: 1.5%;
          top: 92.0%;
          font: 600 0.060in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.008in;
          color: rgba(70,70,70,.42);
        }

        /* New locked back master geometry. */
        .back-qr-mask {
          position: absolute;
          z-index: 2;
          left: 60.2%;
          top: 20.8%;
          width: 16.9%;
          height: 25.2%;
          border-radius: 0.035in;
          background: #fff;
        }
        .back-claim-mask {
          position: absolute;
          z-index: 2;
          left: 76.3%;
          top: 32.2%;
          width: 21.7%;
          height: 9.6%;
          border-radius: 0.035in;
          background: #fff;
        }
        .back-qr {
          position: absolute;
          z-index: 3;
          left: 60.8%;
          top: 21.5%;
          width: 0.95in;
          height: 0.95in;
          object-fit: contain;
          image-rendering: auto;
        }
        .back-claim-code {
          position: absolute;
          z-index: 3;
          left: 76.9%;
          top: 33.0%;
          width: 20.5%;
          height: 8.0%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: #111;
          font: 800 0.145in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.015in;
          white-space: nowrap;
        }
        .back-sequence {
          position: absolute;
          z-index: 3;
          left: 1.3%;
          top: 94.2%;
          font: 600 0.055in/1 Arial, Helvetica, sans-serif;
          letter-spacing: 0.008in;
          color: rgba(255,255,255,.40);
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
