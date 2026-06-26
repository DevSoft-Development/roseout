import Link from "next/link";
const nav = [
  ["/user/dashboard", "Overview"],
  ["/user/dashboard/saved", "Saved Outings"],
  ["/user/dashboard/outings", "My Outings"],
  ["/user/dashboard/preferences", "Preferences"],
  ["/user/dashboard/account", "Account"],
  ["/support", "Support"],
];
export default function UserDashboardShell({
  children,
  isBeta = false,
}: {
  children: React.ReactNode;
  isBeta?: boolean;
}) {
  const items = isBeta
    ? [
        ...nav.slice(0, 4),
        ["/user/dashboard/beta", "Beta Tasks"],
        ...nav.slice(4),
      ]
    : nav;
  return (
    <main className="min-h-screen bg-[#080407] text-white">
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-full border border-white/10 bg-black/30 p-2">
          {items.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-full bg-white/[0.06] px-4 py-2 text-xs font-black text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
export function DashboardCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/25 ${className}`}
    >
      {children}
    </div>
  );
}
