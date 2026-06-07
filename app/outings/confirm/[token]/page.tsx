import { ConfirmClient } from "./ConfirmClient";

export default async function ConfirmOutingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-[#12070a] px-6 py-12 text-white">
      <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-rose-200">TheOutHaven follow-up</p>
        <h1 className="mt-4 text-4xl font-black">How did everything go?</h1>
        <p className="mt-3 text-white/70">Your feedback helps us improve future recommendations.</p>
        <ConfirmClient token={token} />
      </section>
    </main>
  );
}
