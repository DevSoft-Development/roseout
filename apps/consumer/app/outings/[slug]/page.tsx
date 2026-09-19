import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug.replace(/-/g, " ")} | Shareable Outing`,
    description: "Shareable outing page with save, share, and booking actions.",
  };
}

export default async function OutingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16 text-white">
      <h1 className="text-4xl font-bold">Shareable Outing</h1>
      <p className="mt-4 text-white/70">Outing slug: {slug}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <button className="rounded-xl bg-[#e1062a] px-4 py-3 font-semibold">Save outing</button>
        <button className="rounded-xl border border-white/30 px-4 py-3">Share outing</button>
        <button className="rounded-xl border border-white/30 px-4 py-3">Book outing</button>
      </div>
    </main>
  );
}
