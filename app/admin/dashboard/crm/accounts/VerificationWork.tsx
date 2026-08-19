import VerificationQueue from "@/app/admin/dashboard/trust/VerificationQueue";

export default function VerificationWork() {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">CRM Verification</p>
        <h2 className="mt-1 text-2xl font-black text-white">Account & Organizer Verification</h2>
        <p className="mt-2 max-w-3xl text-sm text-white/55">
          Review organization legitimacy and organizer publishing trust from the CRM instead of separate Trust & Safety pages.
        </p>
      </div>

      <details id="organization-verification" className="rounded-2xl border border-white/10 bg-black/20 p-4" open>
        <summary className="cursor-pointer text-base font-black text-white">Organization Verification</summary>
        <p className="mt-2 text-sm text-white/50">Confirm whether a business, venue, nonprofit, promoter, creator, or other entity is legitimate.</p>
        <div className="mt-4"><VerificationQueue type="organization" /></div>
      </details>

      <details id="organizer-verification" className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer text-base font-black text-white">Organizer Verification</summary>
        <p className="mt-2 text-sm text-white/50">Review event-publishing trust without mixing it with financial/KYC verification.</p>
        <div className="mt-4"><VerificationQueue type="organizer" /></div>
      </details>
    </section>
  );
}
