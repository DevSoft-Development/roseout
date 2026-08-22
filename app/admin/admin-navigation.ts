import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Contact,
  CreditCard,
  Flag,
  Home,
  Landmark,
  LineChart,
  ListTodo,
  LockKeyhole,
  Mail,
  MapPin,
  MessageSquare,
  Network,
  QrCode,
  Rocket,
  SearchCheck,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TicketCheck,
  UserCheck,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import type { AdminPermissionKey } from "@/lib/admin-permissions";

export type AdminNavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  status?: "active" | "planned";
  permission?: AdminPermissionKey;
};

export type AdminNavSection = {
  label: string;
  icon: LucideIcon;
  items: readonly AdminNavItem[];
};

export const adminOverview: AdminNavItem = {
  label: "Overview",
  href: "/admin/dashboard",
  icon: Home,
  permission: "dashboard",
};

export const adminNavSections: readonly AdminNavSection[] = [
  {
    label: "Marketplace",
    icon: Landmark,
    items: [
      { label: "Events & Experiences", href: "/admin/dashboard/events-experiences", icon: CalendarDays, permission: "events" },
    ],
  },
  {
    label: "Trust & Safety",
    icon: ShieldCheck,
    items: [
      { label: "Fraud & Investigations", href: "/admin/dashboard/fraud", icon: LockKeyhole, permission: "fraud" },
      { label: "Events & Experiences Moderation", href: "/admin/dashboard/events-experiences/moderation", icon: ShieldAlert, permission: "fraud" },
      { label: "Reports", href: "/admin/dashboard/fraud?view=reports", icon: Flag, permission: "fraud" },
    ],
  },
  {
    label: "Commerce",
    icon: CreditCard,
    items: [
      { label: "Billing", href: "/admin/dashboard/billing", icon: CircleDollarSign, permission: "billing" },
      { label: "Ticket Orders", icon: TicketCheck, status: "planned" },
      { label: "Payouts", icon: WalletCards, status: "planned" },
    ],
  },
  {
    label: "CRM",
    icon: Contact,
    items: [
      { label: "Today", href: "/admin/dashboard/crm/today", icon: Home, permission: "crm" },
      { label: "Locations", href: "/admin/dashboard/crm/locations", icon: MapPin, permission: "crm" },
      { label: "Location Health", href: "/admin/dashboard/crm/location-health", icon: ShieldCheck, permission: "crm" },
      { label: "Print Labels / QR Codes", href: "/admin/dashboard/claim-qrs", icon: QrCode, permission: "claimQrs" },
      { label: "Accounts", href: "/admin/dashboard/crm/accounts", icon: Building2, permission: "crm" },
      { label: "Contacts", href: "/admin/dashboard/crm/contacts", icon: Contact, permission: "crm" },
      { label: "Opportunities", href: "/admin/dashboard/crm/opportunities", icon: LineChart, permission: "crm" },
      { label: "Tasks", href: "/admin/dashboard/crm/tasks", icon: ListTodo, permission: "crm" },
      { label: "Communications", href: "/admin/dashboard/crm/outreach", icon: MessageSquare, permission: "crm" },
      { label: "Support", href: "/admin/dashboard/crm/support", icon: TicketCheck, permission: "crm" },
    ],
  },
  {
    label: "Operations",
    icon: Wrench,
    items: [
      { label: "Mailing Batches", href: "/admin/dashboard/operations/mailing-batches", icon: Mail, permission: "mailingBatches" },
      { label: "Search Health", href: "/admin/dashboard/search-health", icon: SearchCheck, permission: "searchHealth" },
      { label: "Data Operations", href: "/admin/dashboard/settings/location-tools", icon: Wrench, permission: "dataQuality" },
      { label: "Website Hosting", href: "/admin/dashboard/website-hosting", icon: Network, permission: "dashboard" },
      { label: "Production Command Center", href: "/admin/dashboard/production", icon: Rocket, permission: "productionFinishLine" },
      { label: "Analytics", href: "/admin/dashboard/analytics", icon: BarChart3, permission: "analytics" },
    ],
  },
  {
    label: "Users",
    icon: Users,
    items: [
      { label: "Consumers", href: "/admin/dashboard/users", icon: Users, permission: "adminUsers" },
      { label: "Admin Staff", href: "/admin/dashboard/team", icon: ShieldCheck, permission: "dashboard" },
    ],
  },
  {
    label: "System",
    icon: Settings,
    items: [
      { label: "Audit Logs", href: "/admin/dashboard/logs", icon: ClipboardCheck, permission: "logs" },
      { label: "Settings", href: "/admin/dashboard/settings", icon: Settings, permission: "settings" },
      { label: "Security", icon: LockKeyhole, status: "planned" },
      { label: "Roles", icon: UserCheck, status: "planned" },
    ],
  },
] as const;
