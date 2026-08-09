import VerificationQueue from "../VerificationQueue";

export const dynamic = "force-dynamic";

export default function OrganizationVerificationPage() {
  return (
    <main className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ec0b5b]">Trust & Safety</p>
        <h1 className="mt-2 text-3xl font-black text-white">Organization Verification</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/55">Review whether a business, venue, nonprofit, promoter, creator, or other entity is legitimate. This is separate from location claims, organizer publishing trust, and payment KYC.</p>
      </div>
      <VerificationQueue type="organization" />
    </main>
  );
}
