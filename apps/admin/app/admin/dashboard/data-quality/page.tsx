import Link from "next/link";
import { EyeOff, Images, Layers3, MapPinned } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

const primaryActions = [
  {
    title: "Review new locations",
    description: "Approve strong Google-discovered locations, keep weak candidates hidden, and resolve review blockers.",
    href: "/admin/dashboard/settings/location-tools/google-discovery",
    action: "Open review queue",
    icon: MapPinned,
  },
  {
    title: "Resolve duplicates",
    description: "Review possible duplicates before they can reach public search or consume more enrichment work.",
    href: "/admin/dashboard/settings/location-tools/duplicates",
    action: "Review duplicates",
    icon: Layers3,
  },
  {
    title: "Repair incomplete data",
    description: "Fill missing photos, websites, hours, categories, and other fields that keep locations from being ready.",
    href: "/admin/dashboard/settings/location-tools/enrichment",
    action: "Open enrichment",
    icon: Images,
  },
  {
    title: "Review hidden inventory",
    description: "See locations currently kept out of public search and decide what can be repaired or should stay hidden.",
    href: "/admin/dashboard/settings/location-tools/hidden-locations",
    action: "Review hidden locations",
    icon: EyeOff,
  },
] as const;

const advancedTools = [
  ["Publishing rules", "/admin/dashboard/settings/location-tools/publishing"],
  ["Photos", "/admin/dashboard/settings/location-tools/photos"],
  ["Import", "/admin/dashboard/settings/location-tools/import"],
  ["Markets", "/admin/dashboard/settings/location-tools/markets"],
  ["Search profiles", "/admin/dashboard/settings/location-tools/search-profiles"],
  ["Claim URLs", "/admin/dashboard/settings/location-tools/claim-urls"],
  ["Logs", "/admin/dashboard/settings/location-tools/logs"],
] as const;

export default async function DataQualityPage() {
  await requireAdminRole(["superadmin", "admin"]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Location Intelligence"
        title="Data Quality"
        subtitle="Prioritize the decision queues that determine whether location inventory is trustworthy, complete, and safe to expose in customer search."
        badge={<AdminStatusBadge tone="green">Quality controls active</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/settings/location-tools">Location Tools</AdminActionButton>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {primaryActions.map((item) => {
          const Icon = item.icon;
          return (
            <AdminSectionCard key={item.href} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200/20 bg-rose-500/10 text-rose-100">
                  <Icon className="h-4 w-4" />
                </span>
                <AdminStatusBadge tone="muted">Decision queue</AdminStatusBadge>
              </div>
              <h2 className="mt-5 text-lg font-black text-white">{item.title}</h2>
              <p className="mt-2 min-h-20 text-sm leading-6 text-white/55">{item.description}</p>
              <Link href={item.href} className="mt-5 inline-flex text-sm font-black text-rose-100 hover:text-white">
                {item.action} →
              </Link>
            </AdminSectionCard>
          );
        })}
      </section>

      <AdminSectionCard className="p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Quality standard</p>
        <h2 className="mt-1 text-xl font-black text-white">Only ready locations should enter public search.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
          Possible duplicates, hidden inventory, and incomplete records should be resolved before publication. Use the decision queues first and the advanced tools only for deeper operational work.
        </p>
      </AdminSectionCard>

      <AdminSectionCard>
        <details>
          <summary className="cursor-pointer list-none px-5 py-4 text-lg font-black text-white">
            Advanced location operations
          </summary>
          <div className="grid gap-2 border-t border-white/10 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {advancedTools.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-black text-white/70 transition hover:border-rose-200/30 hover:text-white"
              >
                {label} →
              </Link>
            ))}
          </div>
        </details>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
