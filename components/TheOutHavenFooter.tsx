import Image from "next/image";
import Link from "next/link";

export default function TheOutHavenFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#050505] px-6 py-14 text-white">
      {/* BACKGROUND */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(225,6,42,0.16),transparent_28%),linear-gradient(180deg,#050505,#000)]" />

      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr_0.75fr]">
        {/* BRAND */}
        <div>
          <Link href="/" className="group inline-flex items-center gap-3">
            <span className="relative flex h-10 w-10 overflow-hidden rounded-full ring-1 ring-white/15 transition group-hover:scale-105">
              <Image
                src="/toh_logo.png"
                alt="TheOutHaven logo"
                fill
                sizes="40px"
                className="object-contain"
              />
            </span>
            <span className="text-2xl font-black tracking-tight">
              TheOutHaven
            </span>
          </Link>

          <p className="mt-5 max-w-md text-sm leading-7 text-white/45">
            Plan date nights, birthday dinners, friends’ nights out, restaurants,
            activities, and full outings with a smarter way to decide where to
            go next.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/create"
              className="rounded-2xl bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/20"
            >
              Start Planning
            </Link>

            <Link
              href="/business"
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
            >
              For Businesses
            </Link>

          </div>
        </div>

        {/* EXPLORE */}
        <FooterColumn
          title="Explore"
          links={[
            { label: "Home", href: "/" },
            { label: "Explore", href: "/explore" },
            { label: "Plan Outing", href: "/create" },
            { label: "Queens", href: "/explore/queens" },
            { label: "Brooklyn", href: "/explore/brooklyn" },
            { label: "Long Island", href: "/explore/long-island" },
          ]}
        />

        {/* BUSINESS */}
        <FooterColumn
          title="Business"
          links={[
            { label: "For Businesses", href: "/business" },
            { label: "Claim Listing", href: "/business/claim" },
            { label: "Apply", href: "/location/apply" },
          ]}
        />



        {/* SUPPORT */}
        <FooterColumn
          title="Support"
          links={[
            { label: "Get Help", href: "/help" },
            { label: "Knowledge Base", href: "/knowledge-base" },
            { label: "FAQ", href: "/faq" },
          ]}
        />

        {/* LEGAL */}
        <FooterColumn
          title="Legal"
          links={[
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
            { label: "Contact", href: "/contact" },
          ]}
        />
      </div>

      {/* BOTTOM */}
      <div className="relative mx-auto mt-12 flex max-w-7xl flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/35 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} TheOutHaven. All rights reserved.</p>

        <p className="max-w-xl leading-6 md:text-right">
          Recommendations may include third-party listings. Always confirm
          details directly with the business.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e1062a]">
        {title}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {links.map((link) => (
          <Link
            key={`${link.label}-${link.href}`}
            href={link.href}
            className="text-sm font-semibold text-white/45 transition hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
