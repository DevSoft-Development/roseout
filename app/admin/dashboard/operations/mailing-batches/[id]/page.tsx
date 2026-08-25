import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import MailingBatchActions from "./MailingBatchActions";
import PostcardTemplatePanel from "./PostcardTemplatePanel";
import StampsPostagePanel from "./StampsPostagePanel";

export const dynamic = "force-dynamic";

type BatchItem = {
  id: string;
  location_id: string | null;
  sequence_number: number;
  status: string;
  claim_code: string | null;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  tracking_token: string;
  printed_at: string | null;
  mailed_at: string | null;
  first_scan_at: string | null;
  claim_started_at: string | null;
  claimed_at: string | null;
  returned_at: string | null;
};

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function pct(part: number, total: number) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

function addressLine(item: BatchItem) {
  const city = String(item.city || "").trim();
  const state = String(item.state || "").trim();
  const zip = String(item.zip_code || "").trim();
  return `${city}${city && state ? ", " : ""}${state}${zip ? ` ${zip}` : ""}`.trim() || "—";
}

export default async function MailingBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.mailingBatches);
  const { id } = await params;

  const [{ data: batch, error: batchError }, { data: itemData, error: itemError }] = await Promise.all([
    supabaseAdmin
      .from("mailing_batch_summary")
      .select("id,name,status,planned_mail_date,mailed_at,completed_at,notes,created_at,item_count,printed_count,mailed_count,scanned_count,claim_started_count,claimed_count,returned_count")
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("mailing_batch_items")
      .select("id,location_id,sequence_number,status,claim_code,business_name,street_address,city,state,zip_code,tracking_token,printed_at,mailed_at,first_scan_at,claim_started_at,claimed_at,returned_at")
      .eq("batch_id", id)
      .order("sequence_number", { ascending: true })
      .limit(1000),
  ]);

  if (batchError || itemError) {
    throw new Error(batchError?.message || itemError?.message || "Could not load mailing batch.");
  }
  if (!batch) notFound();

  const items = (itemData || []) as BatchItem[];
  const total = Number(batch.item_count || items.length || 0);
  const printed = Number(batch.printed_count || 0);
  const mailed = Number(batch.mailed_count || 0);
  const scans = Number(batch.scanned_count || 0);
  const claimStarts = Number(batch.claim_started_count || 0);
  const claims = Number(batch.claimed_count || 0);
  const canManage = canAdmin(admin.role, "mailingBatchesManage");

  return (
    <main className="mailing-batch-detail min-h-screen bg-[#080706] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/dashboard/operations/mailing-batches" className="text-sm font-black text-white/50 hover:text-white">← Mailing batches</Link>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white/60">{String(batch.status).replaceAll("_", " ")}</span>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.16),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-300">Claim postcard batch</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{batch.name}</h1>
              <p className="mt-3 text-sm text-white/50">Created {fmt(batch.created_at)} · Planned mail date {batch.planned_mail_date || "not set"}</p>
              {batch.notes ? <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{batch.notes}</p> : null}
            </div>
            {canManage ? <MailingBatchActions batchId={id} status={String(batch.status)} /> : null}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Cards", total, "Locations in batch"],
            ["Printed", printed, pct(printed, total)],
            ["Mailed", mailed, pct(mailed, total)],
            ["QR scans", scans, pct(scans, mailed)],
            ["Claim starts", claimStarts, pct(claimStarts, mailed)],
            ["Claimed", claims, pct(claims, mailed)],
          ].map(([label, value, detail]) => (
            <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
              <p className="mt-2 text-2xl font-black">{value}</p>
              <p className="mt-1 text-xs text-white/40">{detail}</p>
            </div>
          ))}
        </section>

        {canManage ? <StampsPostagePanel batchId={id} total={total} /> : null}
        {canManage ? <PostcardTemplatePanel batchId={id} /> : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-xl font-black">Batch locations</h2>
            <p className="mt-1 text-sm text-white/45">Each sequence number permanently keeps the mailing address, tracking QR, and claim code together on both sides of the postcard.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.035] text-[11px] font-black uppercase tracking-[0.14em] text-white/35">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Mailing address</th>
                  <th className="px-4 py-3">Claim code</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Printed</th>
                  <th className="px-4 py-3">Scanned</th>
                  <th className="px-5 py-3">Claimed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-white/[0.025]">
                    <td className="px-5 py-4 font-mono font-black text-white/45">{String(item.sequence_number).padStart(4, "0")}</td>
                    <td className="px-4 py-4 font-black">{item.business_name}</td>
                    <td className="px-4 py-4 text-white/65">
                      <div>{item.street_address || "—"}</div>
                      <div>{addressLine(item)}</div>
                    </td>
                    <td className="px-4 py-4 font-mono font-black tracking-[0.12em]">{item.claim_code || "—"}</td>
                    <td className="px-4 py-4"><span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-bold text-white/65">{item.status.replaceAll("_", " ")}</span></td>
                    <td className="px-4 py-4 text-white/55">{fmt(item.printed_at)}</td>
                    <td className="px-4 py-4 text-white/55">{fmt(item.first_scan_at)}</td>
                    <td className="px-5 py-4 text-white/55">{fmt(item.claimed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
