export const CRM_LEGACY_ROUTE_MIGRATIONS = [
  ["/admin/dashboard/crm/my-queue", "/admin/dashboard/crm/my-work"],
  ["/admin/dashboard/crm/work-queue", "/admin/dashboard/crm/my-work"],
  ["/admin/dashboard/crm/social-outreach", "/admin/dashboard/crm/outreach?channel=social"],
  ["/admin/dashboard/crm/claim-codes", "/admin/dashboard/crm/claims?module=claim-codes"],
  ["/admin/dashboard/crm/escalations", "/admin/dashboard/crm/support?view=escalated"],
  ["/admin/dashboard/crm/change-requests", "/admin/dashboard/crm/support?view=change-requests"],
  ["/admin/dashboard/crm/performance", "/admin/dashboard/crm/performance"],
] as const;

export const CRM_ENTERPRISE_MODULES = [
  "home", "my-work", "tasks", "calendar", "notifications", "accounts", "contacts", "locations", "claims", "opportunities", "outreach", "follow-ups", "site-visits", "support", "escalations", "change-requests", "operations", "claim-codes", "reports", "performance", "activity-audit", "knowledge-base",
] as const;
