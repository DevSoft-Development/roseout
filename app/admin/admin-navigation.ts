import type { LucideIcon } from "lucide-react";
import { BarChart3, Building2, CalendarDays, CircleDollarSign, ClipboardCheck, Contact, CreditCard, Flag, Home, Image, Landmark, Lightbulb, LineChart, Link2, ListTodo, LockKeyhole, Mail, MapPin, Megaphone, MessageSquare, MonitorSmartphone, Network, QrCode, Rocket, SearchCheck, Settings, ShieldAlert, ShieldCheck, TicketCheck, UserCheck, Users, WalletCards, Wrench } from "lucide-react";
import type { AdminPermissionKey } from "@/lib/admin-permissions";

export type AdminNavItem = { label: string; href?: string; icon: LucideIcon; status?: "active" | "planned"; permission?: AdminPermissionKey; };
export type AdminNavSection = { label: string; icon: LucideIcon; items: readonly AdminNavItem[]; };
export const adminOverview: AdminNavItem = { label: "Overview", href: "/admin/dashboard", icon: Home, permission: "dashboard" };

export const adminNavSections: readonly AdminNavSection[] = [
  { label: "Marketplace", icon: Landmark, items: [
    { label: "Events & Experiences", href: "/admin/dashboard/events-experiences", icon: CalendarDays, permission: "events" },
  ] },
  { label: "Trust & Safety", icon: ShieldCheck, items: [
    { label: "Fraud & Investigations", href: "/admin/dashboard/fraud", icon: LockKeyhole, permission: "fraud" },
    { label: "Events & Experiences Moderation", href: "/admin/dashboard/events-experiences/moderation", icon: ShieldAlert, permission: "fraud" },
    { label: "Reports", href: "/admin/dashboard/fraud?view=reports", icon: Flag, permission: "fraud" },
  ] },
  { label: "Commerce", icon: CreditCard, items: [
    { label: "Billing", href: "/admin/dashboard/billing", icon: CircleDollarSign, permission: "billing" },
    { label: "Ticket Orders", href: "/admin/dashboard/ticket-orders", icon: TicketCheck, permission: "ticketOrders" },
    { label: "Payouts", href: "/admin/dashboard/payouts", icon: WalletCards, permission: "payouts" },
  ] },
  { label: "CRM", icon: Contact, items: [
    { label: "Today", href: "/admin/dashboard/crm/today", icon: Home, permission: "crm" }, { label: "Locations", href: "/admin/dashboard/crm/locations", icon: MapPin, permission: "crm" }, { label: "Location Health", href: "/admin/dashboard/crm/location-health", icon: ShieldCheck, permission: "crm" }, { label: "Reserve Opportunities", href: "/admin/dashboard/reservation-opportunities", icon: LineChart, permission: "crm" }, { label: "Print Labels / QR Codes", href: "/admin/dashboard/claim-qrs", icon: QrCode, permission: "claimQrs" }, { label: "Accounts", href: "/admin/dashboard/crm/accounts", icon: Building2, permission: "crm" }, { label: "Contacts", href: "/admin/dashboard/crm/contacts", icon: Contact, permission: "crm" }, { label: "Opportunities", href: "/admin/dashboard/crm/opportunities", icon: LineChart, permission: "crm" }, { label: "Tasks", href: "/admin/dashboard/crm/my-work", icon: ListTodo, permission: "crm" }, { label: "Calendar", href: "/admin/dashboard/crm/calendar", icon: CalendarDays, permission: "crm" }, { label: "Communications", href: "/admin/dashboard/crm/outreach", icon: MessageSquare, permission: "crm" }, { label: "Support", href: "/admin/dashboard/crm/support", icon: TicketCheck, permission: "crm" },
  ] },
  { label: "Marketing", icon: Megaphone, items: [
    { label: "Overview", href: "/admin/dashboard/marketing", icon: Home, permission: "marketing" }, { label: "Today", href: "/admin/dashboard/marketing/today", icon: ListTodo, permission: "marketing" }, { label: "Reports", href: "/admin/dashboard/marketing/reports", icon: BarChart3, permission: "marketing" }, { label: "SEO Center", href: "/admin/dashboard/seo", icon: SearchCheck, permission: "seoTools" }, { label: "Content", href: "/admin/dashboard/marketing/content", icon: Megaphone, permission: "marketing" }, { label: "Content Opportunities", href: "/admin/dashboard/marketing/opportunities", icon: Lightbulb, permission: "marketing" }, { label: "Calendar", href: "/admin/dashboard/marketing/calendar", icon: CalendarDays, permission: "marketing" }, { label: "Media", href: "/admin/dashboard/marketing/media", icon: Image, permission: "marketing" }, { label: "Approvals", href: "/admin/dashboard/marketing/approvals", icon: ClipboardCheck, permission: "marketing" }, { label: "Social Accounts", href: "/admin/dashboard/marketing/social-accounts", icon: Network, permission: "marketingSocialAccounts" }, { label: "Settings", href: "/admin/dashboard/marketing/settings", icon: Settings, permission: "marketing" },
  ] },
  { label: "Employees", icon: UserCheck, items: [
    { label: "Careers Overview", href: "/admin/dashboard/careers", icon: Home, permission: "careers" },
    { label: "Jobs", href: "/admin/dashboard/careers/jobs", icon: ListTodo, permission: "careers" },
    { label: "Hiring", href: "/admin/dashboard/careers/pipeline", icon: LineChart, permission: "careers" },
    { label: "Talent Pool", href: "/admin/dashboard/careers/talent-pool", icon: Users, permission: "careers" },
    { label: "Internships", href: "/admin/dashboard/careers/internships", icon: UserCheck, permission: "careers" },
    { label: "Employees", href: "/admin/dashboard/careers/team-conversion", icon: ShieldCheck, permission: "careersTeamConversion" },
    { label: "Recruiting Marketing", href: "/admin/dashboard/careers/marketing", icon: MessageSquare, permission: "careers" },
    { label: "Career Settings", href: "/admin/dashboard/careers/settings", icon: Settings, permission: "careersEdit" },
  ] },
  { label: "Operations", icon: Wrench, items: [
    { label: "Mailing Batches", href: "/admin/dashboard/operations/mailing-batches", icon: Mail, permission: "mailingBatches" }, { label: "Short Links", href: "/admin/dashboard/short-links", icon: Link2, permission: "shortLinks" }, { label: "Search Health", href: "/admin/dashboard/search-health", icon: SearchCheck, permission: "searchHealth" }, { label: "Platform Errors", href: "/admin/dashboard/platform-errors", icon: ShieldAlert, permission: "logs" }, { label: "Location Intelligence", href: "/admin/dashboard/settings/location-tools", icon: Wrench, permission: "dataQuality" }, { label: "Curated Google Discovery", href: "/admin/dashboard/settings/location-tools/google-discovery", icon: SearchCheck, permission: "dataQuality" }, { label: "Website Hosting", href: "/admin/dashboard/website-hosting", icon: Network, permission: "dashboard" }, { label: "Production Command Center", href: "/admin/dashboard/production", icon: Rocket, permission: "productionFinishLine" }, { label: "Analytics", href: "/admin/dashboard/analytics", icon: BarChart3, permission: "analytics" },
  ] },
  { label: "Users", icon: Users, items: [ { label: "Consumers", href: "/admin/dashboard/users", icon: Users, permission: "adminUsers" }, { label: "Admin Staff", href: "/admin/dashboard/team", icon: ShieldCheck, permission: "dashboard" } ] },
  { label: "System", icon: Settings, items: [
    { label: "Microsoft 365", href: "/admin/dashboard/settings/microsoft-365", icon: Mail, permission: "dashboard" },
    { label: "Device Management", href: "/admin/dashboard/security/devices", icon: MonitorSmartphone, permission: "security" },
    { label: "Cloud Infrastructure", href: "/admin/dashboard/infrastructure", icon: Network, permission: "productionFinishLine" },
    { label: "Security", href: "/admin/dashboard/security", icon: LockKeyhole, permission: "security" },
    { label: "Settings", href: "/admin/dashboard/settings", icon: Settings, permission: "settings" },
    { label: "Roles", href: "/admin/dashboard/roles", icon: UserCheck, permission: "roles" },
  ] },
] as const;
