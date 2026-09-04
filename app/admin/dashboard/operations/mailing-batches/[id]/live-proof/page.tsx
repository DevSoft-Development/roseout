import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const BUCKET = "postcard-templates";

function Message({ batchId, title, detail }: { batchId: string; title: string; detail: string }) {
  return (
    <main className="min-h-screen bg-[#080706] p-8 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">{detail}</p>
        <Link href={`/admin/dashboard/operations/mailing-batches/${batchId}`} className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black">
          Back to batch
        </Link>
      </div>
    </main>
  );
}

export default async function MailingBatchLiveProofPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.mailingBatches);
  const { id } = await params;

  const { data: activeItems, error } = await supabaseAdmin
    .from("mailing_batch_items")
    .select("id,sequence_number,stamps_postage_status,stamps_tx_id,stamps_integrator_tx_id,stamps_postage_purchased_at")
    .eq("batch_id", id)
    .not("status", "eq", "cancelled")
    .order("sequence_number", { ascending: true })
    .limit(1000);

  if (error) throw new Error(error.message || "Could not load the purchased Stamps.com proof.");
  const items = activeItems || [];
  const purchased = items.filter((item) =>
    item.stamps_postage_status === "purchased"
      && item.stamps_tx_id
      && item.stamps_integrator_tx_id
      && item.stamps_postage_purchased_at,
  );
  if (!purchased.length) {
    return <Message batchId={id} title="No live postage proof yet" detail="This batch does not have a persisted purchased postcard. Create the controlled live proof before opening production print mode." />;
  }

  const folder = `production-proofs/${id}`;
  const { data: objects, error: storageError } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (storageError) throw new Error(storageError.message || "Could not load the saved live postage image.");
  const objectNames = new Set((objects || []).map((entry) => entry.name));

  if (items.length > 1 && purchased.length === items.length) {
    const missing = purchased.filter((item) => !objectNames.has(`${item.id}.png`));
    if (missing.length) {
      return <Message batchId={id} title="Live batch postage images need review" detail={`${missing.length.toLocaleString()} purchased postcard${missing.length === 1 ? " is" : "s are"} missing a saved indicium image. Do not purchase those postcards again. Review the existing Stamps.com transactions first.`} />;
    }
    redirect(`/admin/dashboard/operations/mailing-batches/${id}/print?mode=duplex&productionBatch=1`);
  }

  const purchase = purchased[0];
  const file = `${purchase.id}.png`;
  if (!objectNames.has(file)) {
    return <Message batchId={id} title="Live postage image needs review" detail="The purchase record exists, but its saved indicium image is missing. Do not purchase this postcard again. Review the existing Stamps.com transaction first." />;
  }

  redirect(`/admin/dashboard/operations/mailing-batches/${id}/print?mode=duplex&production=1&item=${encodeURIComponent(purchase.id)}`);
}
