import Link from "next/link";

type FooterLink = { label: string; href: string };
const groups: { title: string; links: FooterLink[] }[] = [
  { title: "Explore", links: [
    { label: "Explore outings", href: "https://theouthaven.com/explore" },
    { label: "Plan an outing", href: "https://theouthaven.com/create" },
    { label: "New York City", href: "https://theouthaven.com/explore" },
  ] },
  { title: "Business", links: [
    { label: "For businesses", href: "https://business.theouthaven.com/business" },
    { label: "Claim your listing", href: "https://business.theouthaven.com/business/claim" },
  ] },
  { title: "Company", links: [
    { label: "About us", href: "https://theouthaven.com/about" },
    { label: "Careers", href: "https://theouthaven.com/careers" },
    { label: "Contact", href: "https://theouthaven.com/contact" },
  ] },
  { title: "Help & legal", links: [
    { label: "Get help", href: "https://theouthaven.com/support" },
    { label: "FAQ", href: "https://theouthaven.com/faq" },
    { label: "Trust Center", href: "https://theouthaven.com/trust" },
    { label: "Privacy", href: "https://theouthaven.com/privacy" },
    { label: "Terms", href: "https://theouthaven.com/terms" },
  ] },
];

export default function TheOutHavenFooter() {
  return (
    <footer aria-label="TheOutHaven site footer" className="border-t border-white/10 bg-[#09090b] px-6 py-10 text-white sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)] lg:gap-16">
          <div>
            <p className="text-lg font-bold tracking-tight">TheOutHaven</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/65">
              Find your next restaurant, activity, or night out. Plan the whole outing in one place.
            </p>
            <Link href="https://theouthaven.com/create" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#e1062a] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#bd0524] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Plan an outing
            </Link>
          </div>
          <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-5 gap-y-9 lg:grid-cols-4">
            {groups.map((group) => (
              <div key={group.title}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/85">{group.title}</h2>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm leading-6 text-white/65 transition hover:text-white focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-3 pt-6 text-xs leading-5 text-white/55 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <p>© {new Date().getFullYear()} TheOutHaven LLC. All rights reserved.</p>
          <p className="max-w-lg">Listings and availability may change. Confirm details with the business.</p>
          <Link href="https://theouthaven.com/status" className="shrink-0 font-semibold text-white/75 underline-offset-4 hover:text-white hover:underline">System status</Link>
        </div>
      </div>
    </footer>
  );
}
