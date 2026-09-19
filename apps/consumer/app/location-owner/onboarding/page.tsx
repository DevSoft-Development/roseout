import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

const steps = [
  ["1. Confirm basics", "Confirm business name, address, city or borough, category, phone number, and website."],
  ["2. Add guest actions", "Add phone, website, social, and reservation links so guests can call, reserve, save, share, and visit."],
  ["3. Add profile details", "Add a short description, photos, hours, tags, vibes, cuisine, or activity details when available."],
  ["4. Choose plan", "Choose TheOutHaven Partner Plan. It includes a standalone reservation portal, website embed, owner dashboard, reminders, waitlist, and discovery."],
  ["5. Go to dashboard", "Review your setup checklist and keep improving your claimed profile."],
];

export default function LocationOwnerOnboardingPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Profile setup</p>
          <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">Complete your business profile</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/62">
            Confirm your listing details, review TheOutHaven Partner Plan, then manage your location from the owner dashboard.
          </p>
          <div className="mt-10 grid gap-4">
            {steps.map(([title, text]) => (
              <article key={title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5">
                <h2 className="text-xl font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <PlanCard title="Free Discovery" text="Keep your business visible on TheOutHaven with a claimed profile, accurate contact details, guest actions, and basic discovery." cta="Continue Free Discovery" href="/location-owner/dashboard" />
            <PlanCard title="TheOutHaven Partner Plan — $99/month" text="Includes a standalone reservation portal, website embed, owner dashboard, reminders, waitlist, and outing discovery." cta="Activate Partner Plan" href="/business#plans" highlighted />
          </div>
        </div>
      </section>
    </main>
  );
}

function PlanCard({ title, text, cta, href, highlighted = false }: { title: string; text: string; cta: string; href: string; highlighted?: boolean }) {
  return (
    <article className={`rounded-[2rem] border p-6 ${highlighted ? "border-[#e1062a]/60 bg-[#e1062a]/15" : "border-white/10 bg-black"}`}>
      <h2 className="text-3xl font-black">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-white/62">{text}</p>
      <Link href={href} className={`mt-6 inline-flex rounded-2xl px-6 py-4 text-sm font-black ${highlighted ? "bg-[#e1062a] text-white" : "bg-white text-black"}`}>
        {cta}
      </Link>
    </article>
  );
}
