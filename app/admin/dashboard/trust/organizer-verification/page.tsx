import VerificationQueue from "../VerificationQueue";

export const dynamic = "force-dynamic";

export default function OrganizerVerificationPage() {
  return (
    <main className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ec0b5b]">Trust & Safety</p>
        <h1 className="mt-2 text-3xl font-black text-white">Organizer Verification</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/55">Review event-publishing trust for organizations. Level 1 remains review-required; Level 4+ may later qualify for trusted publishing. Financial/KYC verification is not handled here.</p>
      </div>
      <VerificationQueue type="organizer" />
    </main>
  );
}
