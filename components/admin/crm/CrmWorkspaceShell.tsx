import Link from "next/link";

const primaryLinks = [
  ["Locations", "/admin/dashboard/crm"],
  ["My Work", "/admin/dashboard/crm/my-work"],
  ["Communications", "/admin/dashboard/crm/outreach"],
  ["Claims", "/admin/dashboard/crm/claims"],
  ["Support", "/admin/dashboard/crm/support"],
  ["Reports", "/admin/dashboard/crm/reports"],
] as const;

export default function CrmWorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-5">
      <div className="sticky top-3 z-40 rounded-[1.25rem] border border-white/10 bg-[#09090b]/90 p-2 shadow-2xl shadow-black/35 backdrop-blur-xl">
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
          {primaryLinks.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-black text-white/65 transition hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-300/40"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}
