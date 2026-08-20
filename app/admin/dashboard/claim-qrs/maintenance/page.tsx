import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import RepairClaimQrButton from "../RepairClaimQrButton";
import { syncClaimFieldsToLocations } from "@/lib/claimQrServer";

export const metadata: Metadata = {
  title: "Claim QR Maintenance | TheOutHaven Admin",
  description: "Administrative repair tools for claim QR codes.",
};

type SearchParams = { repair?: string };

export default async function ClaimQrMaintenancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.claimQrs);
  const params = await searchParams;
  const ranFullRepair = params.repair === "1";

  if (ranFullRepair) {
    await syncClaimFieldsToLocations({
      forceCanonicalUrl: true,
      regenerateQr: true,
    });
  }

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.18),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-300">Admin maintenance</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Claim QR Maintenance</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                These tools repair historical or inconsistent claim QR records. They are separated from the normal QR printing workflow because they can update many location records at once.
              </p>
            </div>
            <Link href="/admin/dashboard/claim-qrs" className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2.5 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
              Back to QR codes
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.06] p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Use with care</p>
          <h2 className="mt-2 text-xl font-black">Repair old legacy QR codes</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Runs the safer batched repair process across restaurants, activities, and canonical locations. Progress and any errors are shown below while it runs.
          </p>
          <div className="mt-5">
            <RepairClaimQrButton />
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Full repair pass</p>
          <h2 className="mt-2 text-xl font-black">Regenerate canonical claim URLs and QR codes</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            This server-side pass synchronizes claim fields across the canonical locations dataset. Use it when the batch repair is not enough or after a legacy-domain migration.
          </p>
          {ranFullRepair && (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">
              Full repair pass completed. Return to the QR page and verify a few representative codes before printing.
            </div>
          )}
          <div className="mt-5">
            <Link href="/admin/dashboard/claim-qrs/maintenance?repair=1" className="inline-flex rounded-full border border-rose-300/30 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 hover:bg-rose-500/20">
              Run full repair pass
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
