import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import ClaimToolsClient from "./ClaimToolsClient";

export const metadata: Metadata = {
  title: "Claim Tools",
  description: "Search claim codes, links, and QR codes.",
};

export default async function AdminClaimToolsPage() {
  await requireAdminRole(["superadmin", "admin", "editor", "viewer"]);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-4 text-white print:bg-white print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-sheet { display: grid !important; }
        }
      `}</style>
      <div className="mx-auto max-w-[1400px] print:max-w-none">
        <section className="no-print rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">Admin Claim Tools</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Claim Codes + QR Codes</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Search locations, restaurants, and activities to copy claim codes, copy secure claim links,
            preview QR codes, print claim sheets, regenerate claim credentials, and sync claim fields.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/admin/dashboard" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
              Back to dashboard
            </Link>
            <Link href="/admin/dashboard/claim-qrs" className="rounded-full border border-white/10 bg-white/[0.07] px-6 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white">
              Print QR Library
            </Link>
          </div>
        </section>

        <ClaimToolsClient />
      </div>
    </main>
  );
}
