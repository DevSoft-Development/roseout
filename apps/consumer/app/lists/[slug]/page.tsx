import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = slug.replace(/-/g, " ");
  return {
    title: `${decodedSlug} | TheOutHaven Lists`,
    description: `Explore the curated list "${decodedSlug}" with spots and outings you can save and share.`,
  };
}

export default async function CuratedListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16 text-white">
      <h1 className="text-4xl font-bold">Curated List</h1>
      <p className="mt-4 text-white/70">List slug: {slug}</p>
      <div className="mt-6 rounded-2xl border border-white/20 p-5 text-sm text-white/75">Optimized for sharing to Instagram, TikTok-friendly cards, and copy-link workflows.</div>
    </main>
  );
}
