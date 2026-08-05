"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Contact,
  Gauge,
  Headphones,
  Home,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  PieChart,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  UserRoundCheck,
} from "lucide-react";
import {
  parseClientCrmContext,
  withClientCrmContext,
  type ClientCrmContext,
} from "@/lib/crm/client-context";

export type CrmNavItem = {
  id: string;
  label: string;
  href: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  aliases?: string[];
  primary?: boolean;
};

type ContextLabels = {
  location?: { id: string; name: string | null; city: string | null; state: string | null } | null;
  account?: { id: string; name: string | null } | null;
  contact?: { id: string; full_name: string | null; email: string | null } | null;
  opportunity?: { id: string; name: string | null } | null;
};

export const enterpriseCrmNavigation: CrmNavItem[] = [
  { id: "home", label: "Home", href: "/admin/dashboard/crm", group: "Workspace", icon: Home, primary: true },
  { id: "my-work", label: "My Work", href: "/admin/dashboard/crm/my-work", group: "Workspace", icon: ClipboardCheck, aliases: ["/admin/dashboard/crm/work-queue", "/admin/dashboard/crm/my-queue"], primary: true },
  { id: "tasks", label: "Tasks", href: "/admin/dashboard/crm/tasks", group: "Workspace", icon: ListChecks },
  { id: "calendar", label: "Calendar", href: "/admin/dashboard/crm/calendar", group: "Workspace", icon: CalendarDays },
  { id: "notifications", label: "Notifications", href: "/admin/dashboard/crm/notifications", group: "Workspace", icon: Bell },
  { id: "accounts", label: "Accounts", href: "/admin/dashboard/crm/accounts", group: "Relationships", icon: Building2, primary: true },
  { id: "contacts", label: "Contacts", href: "/admin/dashboard/crm/contacts", group: "Relationships", icon: Contact },
  { id: "locations", label: "Locations", href: "/admin/dashboard/crm/locations", group: "Relationships", icon: MapPin, primary: true },
  { id: "claims", label: "Claims", href: "/admin/dashboard/crm/claims", group: "Relationships", icon: UserRoundCheck, primary: true },
  { id: "opportunities", label: "Opportunities", href: "/admin/dashboard/crm/opportunities", group: "Sales", icon: Target, primary: true },
  { id: "outreach", label: "Outreach", href: "/admin/dashboard/crm/outreach", group: "Sales", icon: MessageSquare, aliases: ["/admin/dashboard/crm/social-outreach"], primary: true },
  { id: "follow-ups", label: "Follow-ups", href: "/admin/dashboard/crm/follow-ups", group: "Sales", icon: Clock3 },
  { id: "site-visits", label: "Site Visits", href: "/admin/dashboard/crm/site-visits", group: "Sales", icon: CalendarDays },
  { id: "support", label: "Support", href: "/admin/dashboard/crm/support", group: "Service", icon: Headphones, primary: true },
  { id: "escalations", label: "Escalations", href: "/admin/dashboard/crm/support?view=escalated", group: "Service", icon: ShieldAlert, aliases: ["/admin/dashboard/crm/escalations"] },
  { id: "change-requests", label: "Change Requests", href: "/admin/dashboard/crm/support?view=change-requests", group: "Service", icon: BriefcaseBusiness, aliases: ["/admin/dashboard/crm/change-requests"] },
  { id: "operations", label: "Operations", href: "/admin/dashboard/crm/operations", group: "Operations", icon: Gauge, primary: true },
  { id: "claim-codes", label: "Claim Codes", href: "/admin/dashboard/crm/claims?module=claim-codes", group: "Operations", icon: Sparkles, aliases: ["/admin/dashboard/crm/claim-codes"] },
  { id: "reports", label: "Reports", href: "/admin/dashboard/crm/reports", group: "Intelligence", icon: PieChart, primary: true },
  { id: "performance", label: "Performance", href: "/admin/dashboard/crm/performance", group: "Intelligence", icon: LayoutDashboard },
  { id: "activity", label: "Activity Audit", href: "/admin/dashboard/crm/activity-audit", group: "Intelligence", icon: Activity },
  { id: "knowledge", label: "Knowledge Base", href: "/admin/dashboard/crm/knowledge-base", group: "Resources", icon: BookOpen },
];

function pathFor(item: CrmNavItem) {
  return item.href.split("?")[0];
}

function isActive(pathname: string, item: CrmNavItem) {
  const href = pathFor(item);
  if (href === "/admin/dashboard/crm") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`) || Boolean(item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)));
}

function contextTitle(labels: ContextLabels) {
  return labels.location?.name || labels.account?.name || labels.contact?.full_name || labels.opportunity?.name || null;
}

function contextSubtitle(labels: ContextLabels) {
  if (labels.location) return [labels.location.city, labels.location.state].filter(Boolean).join(", ");
  if (labels.account?.name && labels.location?.name) return labels.account.name;
  if (labels.contact?.email) return labels.contact.email;
  return null;
}

export default function EnterpriseCrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin/dashboard/crm";
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const context = useMemo<ClientCrmContext>(() => parseClientCrmContext(new URLSearchParams(searchString)), [searchString]);
  const [labels, setLabels] = useState<ContextLabels>({});
  const current = enterpriseCrmNavigation.find((item) => isActive(pathname, item));
  const primaryItems = enterpriseCrmNavigation.filter((item) => item.primary);
  const secondaryGroups = enterpriseCrmNavigation
    .filter((item) => !item.primary)
    .reduce<Record<string, CrmNavItem[]>>((result, item) => {
      (result[item.group] ||= []).push(item);
      return result;
    }, {});

  useEffect(() => {
    const hasContext = context.locationId || context.accountId || context.contactId || context.opportunityId;
    if (!hasContext) {
      setLabels({});
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (context.locationId) query.set("location_id", context.locationId);
    if (context.accountId) query.set("account_id", context.accountId);
    if (context.contactId) query.set("contact_id", context.contactId);
    if (context.opportunityId) query.set("opportunity_id", context.opportunityId);
    fetch(`/api/admin/crm/context?${query.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("context request failed"))))
      .then((payload) => setLabels(payload.labels || {}))
      .catch((error) => {
        if (error?.name !== "AbortError") setLabels({});
      });
    return () => controller.abort();
  }, [context.accountId, context.contactId, context.locationId, context.opportunityId]);

  const selectedTitle = contextTitle(labels);
  const selectedSubtitle = contextSubtitle(labels);
  const currentUrl = `${pathname}${searchString ? `?${searchString}` : ""}`;
  const contextual = (href: string) => withClientCrmContext(href, { ...context, returnTo: context.returnTo || currentUrl });

  return (
    <div data-testid="crm-single-navigation-shell" className="min-w-0 bg-[#070707] text-[#f8f8fa]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0c0c0e]/95 backdrop-blur">
        <div className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2 sm:px-4">
          <div className="hidden min-w-0 shrink-0 text-sm text-zinc-400 md:block">
            <Link href="/admin/dashboard" className="hover:text-white">Admin</Link>
            <span className="px-2">/</span>
            <Link href={contextual("/admin/dashboard/crm")} className="hover:text-white">CRM</Link>
            {current ? <><span className="px-2">/</span><span className="text-white">{current.label}</span></> : null}
          </div>
          {selectedTitle ? (
            <div className="hidden min-w-0 max-w-[280px] border-l border-white/10 pl-3 lg:block">
              <p className="truncate text-xs font-black uppercase tracking-[0.15em] text-rose-300">Selected relationship</p>
              <p className="truncate text-sm font-black text-white">{selectedTitle}</p>
              {selectedSubtitle ? <p className="truncate text-xs text-zinc-400">{selectedSubtitle}</p> : null}
            </div>
          ) : null}
          <Link href={contextual("/admin/dashboard/crm?focus=search")} className="ml-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-[#18181d] px-3 text-sm text-zinc-400 hover:border-white/20 hover:text-zinc-200 sm:max-w-xl">
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Search CRM records</span>
          </Link>
          <Link href={contextual("/admin/dashboard/crm/tasks?create=task")} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ec0b5b] px-3 text-sm font-bold text-white hover:bg-[#ff206e]">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Link>
          <Link aria-label="CRM notifications" href={contextual("/admin/dashboard/crm/notifications")} className="rounded-xl border border-white/10 bg-[#18181d] p-2.5 text-zinc-200 hover:text-white">
            <Bell className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-2 border-t border-white/[0.06] px-3 py-2 sm:px-4">
          <nav aria-label="Primary CRM modules" className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              return (
                <Link key={item.id} href={contextual(item.href)} aria-current={active ? "page" : undefined} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${active ? "bg-[#ec0b5b] text-white" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"}`}>
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <details className="relative shrink-0">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-white/10 bg-[#18181d] px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.08]">
              <MoreHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">All CRM</span>
            </summary>
            <div className="absolute right-0 top-11 z-50 w-[min(92vw,420px)] rounded-xl border border-white/10 bg-[#121216] p-3 shadow-2xl">
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(secondaryGroups).map(([group, items]) => (
                  <section key={group}>
                    <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{group}</p>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(pathname, item);
                        return (
                          <Link key={item.id} href={contextual(item.href)} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${active ? "bg-[#ec0b5b] text-white" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"}`}>
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </details>
        </div>
      </header>

      <main className="min-w-0 overflow-x-hidden px-3 py-4 sm:px-5 lg:px-6">
        <div className="mx-auto w-full max-w-[1500px] min-w-0">{children}</div>
      </main>
    </div>
  );
}
