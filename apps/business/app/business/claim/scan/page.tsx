"use client";

import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import ClaimQrScanLauncher from "@/components/business/ClaimQrScanLauncher";

export default function ScanClaimCodePage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto max-w-3xl">
          <Link href="/business/claim" className="text-sm font-black text-white/45 transition hover:text-white">
            ← Back to claim options
          </Link>
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Business owner claim</p>
            <h1 className="mt-4 text-4xl font-black">Scan your claim QR code</h1>
            <p className="mt-4 text-sm leading-7 text-white/62">
              Use your device camera to scan the QR code on your postcard. If scanning does not work, enter your claim code manually on the claim page.
            </p>

            <ClaimQrScanLauncher className="mt-6" mode="redirect" />

            <Link
              href="/business/claim"
              className="mt-5 inline-flex w-full justify-center rounded-2xl bg-white px-6 py-4 text-sm font-black text-black transition hover:bg-rose-100"
            >
              Enter claim code manually
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
