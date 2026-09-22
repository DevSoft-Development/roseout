"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CRM_ENTERPRISE_SECTIONS,
  getCrmEnterpriseActiveSection,
  getCrmEnterpriseHref,
} from "@/lib/admin/crm-enterprise-workspace";

export default function EnterpriseCrmWorkspaceShell({
  locationId,
  children,
}: {
  locationId: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const activeSection = getCrmEnterpriseActiveSection(searchParams.get("tab"));

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-4 px-3 pb-12 sm:px-5 xl:px-7">
      <div className="sticky top-0 z-40 -mx-3 border-b border-white/10 bg-[#090909]/95 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 xl:-mx-7 xl:px-7">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45">
              <Link href="/admin/dashboard" className="transition hover:text-white">Admin</Link>
              <span>/</span>
              <Link href="/admin/dashboard/crm" className="transition hover:text-white">CRM</Link>
              <span>/</span>
              <span className="truncate text-rose-200">Location workspace</span>
            </nav>
            <p className="mt-1 text-sm text-white/45">One workspace for profile quality, search visibility, photos, menus, packages, and public preview.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={getCrmEnterpriseHref(locationId, "profile")} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/80 transition hover:border-white/20 hover:bg-white/[0.1]">Edit profile</Link>
            <Link href={getCrmEnterpriseHref(locationId, "listing")} className="rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-100 transition hover:bg-rose-500/15">Improve search</Link>
            <Link href={getCrmEnterpriseHref(locationId, "menu-packages")} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500">Open menu editor</Link>
          </div>
        </div>

        <nav aria-label="Location workspace navigation" className="mt-3 max-w-full overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-[1.1rem] border border-white/10 bg-black/35 p-1.5">
            {CRM_ENTERPRISE_SECTIONS.map((section) => {
              const active = section.id === activeSection || (section.id === "publishability" && searchParams.get("tab") === "listing");
              return (
                <Link
                  key={section.id}
                  href={getCrmEnterpriseHref(locationId, section.tab)}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-[0.85rem] px-4 py-2.5 text-sm font-black transition ${active ? "bg-rose-600 text-white shadow-lg shadow-rose-950/35" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
                >
                  {section.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {children}
    </div>
  );
}
