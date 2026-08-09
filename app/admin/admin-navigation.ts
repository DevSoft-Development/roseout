import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckSquare2,
  CircleDollarSign,
  ClipboardCheck,
  Contact,
  CreditCard,
  DatabaseZap,
  Flag,
  Gift,
  Home,
  Import,
  Landmark,
  LineChart,
  ListTodo,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Network,
  QrCode,
  ReceiptText,
  RefreshCcw,
  Rocket,
  SearchCheck,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserCheck,
  Users,
  WalletCards,
  WandSparkles,
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
      { label: "Locations", href: "/admin/dashboard/locations", icon: MapPin, permission: "locations" },
      { label: "Activities", href: "/admin/activities", icon: Activity, permission: "locations" },
      { label: "Events", icon: CalendarDays, status: "planned" },
      { label: "Experiences", icon: Sparkles, status: "planned" },
      { label: "Organizations", icon: Building2, status: "planned" },
      { label: "Providers", icon: BriefcaseBusiness, status: "planned" },
    ],
  },
  {
    label: "Trust & Safety",
    icon: ShieldCheck,
    items: [
      { label: "Location Claims", href: "/admin/dashboard/claims", icon: ClipboardCheck, permission: "claims" },
      { label: "Claim QR Tools", href: "/admin/dashboard/claim-qrs", icon: QrCode, permission: "claimQrs" },
      { label: "Duplicates", href: "/admin/dashboard/settings/location-tools/duplicates", icon: CheckSquare2, permission: "dataQuality" },
      { label: "Organization Verification", icon: Building2, status: "planned" },
      { label: "Organizer Verification", icon: UserCheck, status: "planned" },
      { label: "Event Moderation", icon: ShieldAlert, status: "planned" },
      { label: "Event Reports", icon: Flag, status: "planned" },
      { label: "Fraud", icon: LockKeyhole, status: "planned" },
    ],
  },
  {
    label: "Commerce",
    icon: CreditCard,
    items: [
      { label: "Reservations", href: "/admin/dashboard/reservations", icon: CalendarDays, permission: "reservations" },
      { label: "Platform Billing", href: "/admin/dashboard/billing", icon: CircleDollarSign, permission: "billing" },
      { label: "Ticket Orders", icon: TicketCheck, status: "planned" },
      { label: "Refunds", icon: RefreshCcw, status: "planned" },
      { label: "Disputes", icon: ReceiptText, status: "planned" },
      { label: "Payouts", icon: WalletCards, status: "planned" },
    ],
  },
  {
    label: "CRM",
    icon: Contact,
    items: [
      { label: "Accounts", href: "/admin/dashboard/crm/accounts", icon: Building2, permission: "crm" },
      { label: "Contacts", href: "/admin/dashboard/crm/contacts", icon: Contact, permission: "crm" },
      { label: "Opportunities", href: "/admin/dashboard/crm/opportunities", icon: LineChart, permission: "crm" },
      { label: "Tasks", href: "/admin/dashboard/crm/tasks", icon: ListTodo, permission: "crm" },
      { label: "Communications", href: "/admin/dashboard/communication", icon: MessageSquare, permission: "communication" },
      { label: "Automation", href: "/admin/dashboard/crm/communications/automation", icon: WandSparkles, permission: "crm" },
      { label: "Forecasting", href: "/admin/dashboard/crm/forecast", icon: BarChart3, permission: "crm" },
      { label: "Location Workspace", href: "/admin/dashboard/crm", icon: MapPin, permission: "crm" },
    ],
  },
  {
    label: "Operations",
    icon: Wrench,
    items: [
      { label: "Search Health", href: "/admin/dashboard/search-health", icon: SearchCheck, permission: "searchHealth" },
      { label: "Search Lab", href: "/admin/dashboard/beta/search-lab", icon: Sparkles, permission: "searchHealth" },
      { label: "Location Tools", href: "/admin/dashboard/settings/location-tools", icon: Wrench, permission: "dataQuality" },
      { label: "Imports", href: "/admin/dashboard/settings/location-tools/import", icon: Import, permission: "import" },
      { label: "Data Quality", href: "/admin/dashboard/data-quality", icon: DatabaseZap, permission: "dataQuality" },
      { label: "Cron Jobs", href: "/admin/dashboard/settings/cron-jobs", icon: RefreshCcw, permission: "settings" },
      { label: "Notifications", href: "/admin/dashboard/crm/notifications", icon: Bell, permission: "crm" },
      { label: "Production Command Center", href: "/admin/dashboard/production", icon: Rocket, permission: "productionFinishLine" },
      { label: "Analytics", href: "/admin/dashboard/analytics", icon: BarChart3, permission: "analytics" },
      { label: "Giveaway", href: "/admin/dashboard/giveaway", icon: Gift, permission: "giveaway" },
      { label: "Provider Health", icon: Network, status: "planned" },
    ],
  },
  {
    label: "Users",
    icon: Users,
    items: [
      { label: "Consumers", href: "/admin/dashboard/users", icon: Users, permission: "adminUsers" },
      { label: "Admin Staff", href: "/admin/dashboard/team", icon: ShieldCheck, permission: "dashboard" },
      { label: "Organization Members", icon: Building2, status: "planned" },
      { label: "Organizers", icon: UserCheck, status: "planned" },
    ],
  },
  {
    label: "System",
    icon: Settings,
    items: [
      { label: "Audit Logs", href: "/admin/dashboard/logs", icon: ClipboardCheck, permission: "logs" },
      { label: "Feature Flags", href: "/admin/dashboard/feature-flags", icon: Flag, permission: "featureFlags" },
      { label: "Settings", href: "/admin/dashboard/settings", icon: Settings, permission: "settings" },
      { label: "Security", icon: LockKeyhole, status: "planned" },
      { label: "Roles", icon: UserCheck, status: "planned" },
    ],
  },
] as const;
