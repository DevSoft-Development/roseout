import Link from "next/link";

export default function ExplorePage() {
  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-28 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Explore TheOutHaven</h1>
        <p className="mt-4 max-w-2xl text-white/70">Discover restaurants, activities, and curated outing ideas.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link href="/restaurants" className="rounded-3xl border border-white/10 bg-white/5 p-6 font-bold hover:bg-white/10">Restaurants</Link>
          <Link href="/activities" className="rounded-3xl border border-white/10 bg-white/5 p-6 font-bold hover:bg-white/10">Activities</Link>
          <Link href="/create" className="rounded-3xl border border-white/10 bg-white/5 p-6 font-bold hover:bg-white/10">Create Outing</Link>
        </div>
      </div>
    </main>
  );
}
