import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  CloudCog,
  Database,
  Flag,
  Gauge,
  Home,
  KeyRound,
  LifeBuoy,
  ListChecks,
  Mail,
  MapPin,
  Megaphone,
  MessageSquareText,
  ReceiptText,
  Rocket,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  TicketPercent,
  UserCog,
  Users,
  WalletCards,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AdminRole } from "@theouthaven/auth/admin-roles";

export type AdminShellNavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  migrated: boolean;
  roles?: readonly AdminRole[];
};

export type AdminShellNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: readonly AdminShellNavItem[];
  defaultOpen?: boolean;
};

const broadReadRoles: readonly AdminRole[] = [
  "superadmin",
  "admin",
  "manager",
  "editor",
  "reviewer",
  "ambassador",
  "experience_team",
  "partner_ambassador",
  "marketing_intern",
  "marketing_specialist",
  "marketing_manager",
  "viewer",
];

const commercialRoles: readonly AdminRole[] = [
  "superadmin",
  "admin",
  "manager",
  "ambassador",
  "partner_ambassador",
];

const marketingRoles: readonly AdminRole[] = [
  "superadmin",
  "admin",
  "manager",
  "editor",
  "marketing_intern",
  "marketing_specialist",
  "marketing_manager",
];

export const adminShellNavigationGroups: readonly AdminShellNavGroup[] = [
  {
    id: "command",
    label: "Command Center",
    icon: Gauge,
    defaultOpen: true,
    items: [
      { label: "Overview", href: "/admin/dashboard", icon: Home, migrated: true },
      {
        label: "Analytics",
        href: "/admin/dashboard/analytics",
        icon: BarChart3,
        migrated: true,
        roles: broadReadRoles,
      },
      {
        label: "Launch Checklist",
        href: "/admin/dashboard/launch-checklist",
        icon: ListChecks,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Production Finish Line",
        href: "/admin/dashboard/production",
        icon: Rocket,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
      {
        label: "Search Health",
        href: "/admin/dashboard/search-health",
        icon: Search,
        migrated: true,
        roles: ["superadmin", "admin", "experience_team"],
      },
    ],
  },
  {
    id: "revenue",
    label: "Revenue & CRM",
    icon: CircleDollarSign,
    items: [
      {
        label: "CRM",
        href: "/admin/dashboard/crm",
        icon: Workflow,
        migrated: true,
        roles: commercialRoles,
      },
      {
        label: "Businesses",
        href: "/admin/dashboard/businesses",
        icon: Building2,
        migrated: true,
        roles: ["superadmin", "admin", "manager"],
      },
      {
        label: "Billing",
        href: "/admin/dashboard/billing",
        icon: ReceiptText,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Plans",
        href: "/admin/dashboard/plans",
        icon: WalletCards,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
      {
        label: "Reservation Opportunities",
        href: "/admin/dashboard/reservation-opportunities",
        icon: CalendarDays,
        migrated: true,
        roles: commercialRoles,
      },
      {
        label: "Payouts",
        href: "/admin/dashboard/payouts",
        icon: WalletCards,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Activity,
    items: [
      {
        label: "Locations",
        href: "/admin/dashboard/locations",
        icon: MapPin,
        migrated: true,
        roles: ["superadmin", "admin", "editor", "reviewer", "viewer"],
      },
      {
        label: "Events & Experiences",
        href: "/admin/dashboard/events-experiences",
        icon: CalendarDays,
        migrated: true,
        roles: ["superadmin", "admin", "editor"],
      },
      {
        label: "Ticket Orders",
        href: "/admin/dashboard/ticket-orders",
        icon: ShoppingBag,
        migrated: true,
        roles: ["superadmin", "admin", "manager", "reviewer", "experience_team"],
      },
      {
        label: "Reviews",
        href: "/admin/dashboard/reviews",
        icon: MessageSquareText,
        migrated: true,
        roles: ["superadmin", "admin", "editor", "experience_team", "viewer"],
      },
      {
        label: "Mailing Batches",
        href: "/admin/dashboard/operations/mailing-batches",
        icon: Mail,
        migrated: true,
        roles: ["superadmin", "admin", "manager"],
      },
      {
        label: "Data Quality",
        href: "/admin/dashboard/data-quality",
        icon: Database,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
      {
        label: "Launch Catalog",
        href: "/admin/dashboard/launch-catalog",
        icon: Database,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
    ],
  },
  {
    id: "growth",
    label: "Growth & Marketing",
    icon: Megaphone,
    items: [
      {
        label: "Marketing",
        href: "/admin/dashboard/marketing",
        icon: Megaphone,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "AI Marketing Manager",
        href: "/admin/dashboard/marketing/social-manager",
        icon: Megaphone,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "Community",
        href: "/admin/dashboard/marketing/community",
        icon: MessageSquareText,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "Growth",
        href: "/admin/dashboard/marketing/growth",
        icon: BarChart3,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "Creators",
        href: "/admin/dashboard/marketing/creators",
        icon: Users,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "Social Accounts",
        href: "/admin/dashboard/marketing/social-accounts",
        icon: Workflow,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "Approvals",
        href: "/admin/dashboard/marketing/approvals",
        icon: ListChecks,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "Campaigns",
        href: "/admin/dashboard/campaigns",
        icon: Megaphone,
        migrated: true,
        roles: marketingRoles,
      },
      {
        label: "SEO Operations",
        href: "/admin/dashboard/seo",
        icon: Search,
        migrated: true,
        roles: ["superadmin", "admin", "editor", "viewer"],
      },
      {
        label: "SEO Tools",
        href: "/admin/dashboard/seo-tools",
        icon: Search,
        migrated: true,
        roles: ["superadmin", "admin", "editor", "viewer"],
      },
    ],
  },
  {
    id: "trust",
    label: "Trust & Support",
    icon: ShieldCheck,
    items: [
      {
        label: "Support",
        href: "/admin/dashboard/support",
        icon: LifeBuoy,
        migrated: true,
        roles: broadReadRoles,
      },
      {
        label: "Trust & Verification",
        href: "/admin/dashboard/trust",
        icon: ShieldCheck,
        migrated: true,
        roles: ["superadmin", "admin", "ambassador", "experience_team", "viewer"],
      },
      {
        label: "Fraud",
        href: "/admin/dashboard/fraud",
        icon: ShieldAlert,
        migrated: true,
        roles: ["superadmin", "admin", "manager", "reviewer"],
      },
      {
        label: "Knowledge Base",
        href: "/admin/dashboard/knowledge-base",
        icon: ScrollText,
        migrated: true,
        roles: broadReadRoles,
      },
      {
        label: "Security",
        href: "/admin/dashboard/security",
        icon: ShieldCheck,
        migrated: true,
        roles: ["superadmin"],
      },
    ],
  },
  {
    id: "infrastructure",
    label: "Cloud & Platform",
    icon: CloudCog,
    items: [
      {
        label: "Cloud Infrastructure",
        href: "/admin/dashboard/website-hosting",
        icon: CloudCog,
        migrated: true,
        roles: broadReadRoles,
      },
      {
        label: "Cron Jobs",
        href: "/admin/dashboard/settings/cron-jobs",
        icon: Activity,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
      {
        label: "Critical Incidents",
        href: "/admin/dashboard/infrastructure/incidents",
        icon: ShieldAlert,
        migrated: true,
        roles: ["superadmin", "admin"],
      },
      {
        label: "Platform Errors",
        href: "/admin/dashboard/platform-errors",
        icon: ShieldAlert,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Platform Logs",
        href: "/admin/dashboard/logs",
        icon: ScrollText,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Feature Flags",
        href: "/admin/dashboard/feature-flags",
        icon: Flag,
        migrated: true,
        roles: ["superadmin"],
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: UserCog,
    items: [
      {
        label: "Users",
        href: "/admin/dashboard/users",
        icon: Users,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Team",
        href: "/admin/dashboard/team",
        icon: Users,
        migrated: true,
        roles: broadReadRoles,
      },
      {
        label: "Roles & Permissions",
        href: "/admin/dashboard/roles",
        icon: UserCog,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Careers",
        href: "/admin/dashboard/careers",
        icon: BriefcaseBusiness,
        migrated: true,
        roles: ["superadmin", "admin", "manager"],
      },
      { label: "Settings", href: "/admin/dashboard/settings", icon: Settings, migrated: true },
      {
        label: "Microsoft 365",
        href: "/admin/dashboard/settings/microsoft-365",
        icon: Mail,
        migrated: true,
      },
      {
        label: "Credentials",
        href: "/admin/dashboard/credentials",
        icon: KeyRound,
        migrated: true,
        roles: ["superadmin"],
      },
      {
        label: "Promo Codes",
        href: "/admin/dashboard/settings/promo-codes",
        icon: TicketPercent,
        migrated: true,
        roles: ["superadmin"],
      },
    ],
  },
] as const;

export const adminShellNavigation: readonly AdminShellNavItem[] =
  adminShellNavigationGroups.flatMap((group) => group.items);

export const adminShellNavigationIndicator = ChevronRight;
