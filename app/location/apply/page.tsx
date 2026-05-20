import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

const paths = [
  {
    eyebrow: "Option 1",
    title: "Claim Existing Location",
    copy: "Find your business already listed on TheOutHaven and request access to manage it.",
    button: "Claim a Location",
    href: "/location/apply/claim",
  },
  {
    eyebrow: "Option 2",
    title: "Add New Location",
    copy: "Add a restaurant, lounge, activity, or experience that is not listed yet.",
    button: "Add New Location",
    href: "/location/apply/new",
  },
];

export default function LocationApplyLandingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(225,6,42,0.22),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.1),transparent_24%),linear-gradient(180deg,#070707,#000)]" />
        <div className="absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-[#e1062a]/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Free Business Listing
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Choose how you want to get listed.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/60 sm:text-lg">
              Claim access to an existing TheOutHaven listing or submit a brand-new
              location for team review.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {paths.map((path) => (
              <article
                key={path.title}
                className="flex min-h-full flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 transition hover:-translate-y-1 hover:border-[#e1062a]/70 hover:bg-[#e1062a]/10 sm:p-8"
              >
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                  {path.eyebrow}
                </p>
                <h2 className="mt-4 text-2xl font-black sm:text-3xl">
                  {path.title}
                </h2>
                <p className="mt-4 flex-1 text-sm leading-7 text-white/55 sm:text-base">
                  {path.copy}
                </p>
                <Link
                  href={path.href}
                  className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/20 transition hover:bg-red-500 sm:w-auto"
                >
                  {path.button}
                </Link>
              </article>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/location/apply"
              className="text-sm font-black text-white/45 transition hover:text-white"
            >
              Back to TheOutHaven for Business
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
