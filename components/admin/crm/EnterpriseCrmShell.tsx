"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Contact,
  Gauge,
  Headphones,
  Home,
  ListChecks,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  PieChart,
  Plus,
  Search,
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
  { id: "home", label: "Today", href: "/admin/dashboard/crm/today", group: "Workspace", icon: Home, primary: true },
  { id: "my-work", label: "My Work", href: "/admin/dashboard/crm/my-work", group: "Workspace", icon: ClipboardCheck, aliases: ["/admin/dashboard/crm/work-queue", "/admin/dashboard/crm/my-queue"], primary: true },
  { id: "locations", label: "Locations", href: "/admin/dashboard/crm/locations", group: "Relationships", icon: MapPin, primary: true },
  { id: "opportunities", label: "Sales", href: "/admin/dashboard/crm/opportunities", group: "Sales", icon: Target, primary: true },
  { id: "communications", label: "Communications", href: "/admin/dashboard/crm/outreach", group: "Sales", icon: MessageSquare, aliases: ["/admin/dashboard/crm/social-outreach", "/admin/dashboard/crm/calls"], primary: true },
  { id: "service", label: "Service", href: "/admin/dashboard/crm/claims", group: "Service", icon: Headphones, aliases: ["/admin/dashboard/crm/support"], primary: true },
  { id: "reports", label: "Reports", href: "/admin/dashboard/crm/reports", group: "Intelligence", icon: PieChart, primary: true },

  { id: "accounts", label: "Accounts", href: "/admin/dashboard/crm/accounts", group: "Relationships", icon: Building2 },
  { id: "contacts", label: "Contacts", href: "/admin/dashboard/crm/contacts", group: "Relationships", icon: Contact },
  { id: "claims", label: "Claims", href: "/admin/dashboard/crm/claims", group: "Service", icon: UserRoundCheck },
  { id: "support", label: "Support", href: "/admin/dashboard/crm/support", group: "Service", icon: Headphones },
  { id: "tasks", label: "Tasks", href: "/admin/dashboard/crm/tasks", group: "Workspace", icon: ListChecks },
  { id: "calendar", label: "Calendar", href: "/admin/dashboard/crm/calendar", group: "Workspace", icon: CalendarDays },
  { id: "operations", label: "Admin Operations", href: "/admin/dashboard/crm/operations", group: "Admin", icon: Gauge },
  { id: "knowledge", label: "Knowledge Base", href: "/admin/dashboard/crm/operations?view=knowledge-base", group: "Resources", icon: BookOpen },
];

function pathFor(item: CrmNavItem) {
  return item.href.split("?")[0];
}

function isActive(pathname: string, item: CrmNavItem) {
  const href = pathFor(item);
  return pathname === href || pathname.startsWith(`${href}/`) || Boolean(item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)));
}

function contextTitle(labels: ContextLabels) {
  return labels.location?.name || labels.account?.name || labels.contact?.full_name || labels.opportunity?.name || null;
}

function contextSubtitle(labels: ContextLabels) {
  if (labels.location) {
    const place = [labels.location.city, labels.location.state].filter(Boolean).join(", ");
    return place || labels.account?.name || null;
  }
  if (labels.account?.name) return labels.account.name;
  if (labels.contact?.email) return labels.contact.email;
  return null;
}

export default function EnterpriseCrmShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/admin/dashboard/crm/today";
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
    <div data-testid="crm-single-navigation-shell" className="min-h-screen min-w-0 bg-[#070707] text-[#f8f8fa]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0b0d]/95 shadow-xl shadow-black/20 backdrop-blur-xl">
        <div className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2 sm:px-5">
          <div className="hidden min-w-0 shrink-0 md:block">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-300">TheOutHaven CRM</p>
            <p className="text-sm font-semibold text-zinc-400">{current?.label || "Workspace"}</p>
          </div>
          {selectedTitle ? (
            <div className="hidden min-w-0 max-w-[280px] border-l border-white/10 pl-3 lg:block">
              <p className="truncate text-xs text-zinc-500">Current record</p>
              <p className="truncate text-sm font-black text-white">{selectedTitle}</p>
              {selectedSubtitle ? <p className="truncate text-xs text-zinc-400">{selectedSubtitle}</p> : null}
            </div>
          ) : null}
          <form action="/admin/dashboard/crm/locations" method="get" role="search" className="ml-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-[#17171b] px-3 text-sm text-zinc-300 transition focus-within:border-rose-400/50 focus-within:ring-2 focus-within:ring-rose-500/10 sm:max-w-xl">
            <Search className="h-4 w-4 shrink-0 text-zinc-500" />
            <input
              type="search"
              name="q"
              defaultValue={searchParams.get("q") || ""}
              placeholder="Search locations by name, phone, address, city…"
              aria-label="Search CRM locations"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-black text-zinc-200 transition hover:bg-white/[0.1] hover:text-white">
              Search
            </button>
          </form>
          <Link href={contextual("/admin/dashboard/crm/tasks?create=task")} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ec0b5b] px-3.5 text-sm font-bold text-white transition hover:bg-[#ff206e]">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Link>
          <Link aria-label="CRM notifications" href={contextual("/admin/dashboard/crm/notifications")} className="rounded-xl border border-white/10 bg-[#17171b] p-2.5 text-zinc-300 hover:text-white">
            <Bell className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-2 border-t border-white/[0.06] px-3 py-2 sm:px-5">
          <nav aria-label="Primary CRM modules" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              return (
                <Link key={item.id} href={contextual(item.href)} aria-current={active ? "page" : undefined} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${active ? "bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/30" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"}`}>
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <details className="relative shrink-0">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-white/10 bg-[#17171b] px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.08] [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">More</span>
            </summary>
            <div className="absolute right-0 top-11 z-50 w-[min(92vw,430px)] rounded-2xl border border-white/10 bg-[#111114] p-3 shadow-2xl shadow-black/60">
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

      <main className="min-w-0 overflow-x-hidden px-3 py-5 sm:px-5 lg:px-6">
        <div className="mx-auto w-full max-w-[1480px] min-w-0">{children}</div>
      </main>
    </div>
  );
}
