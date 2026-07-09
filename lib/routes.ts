export const ROUTES = {
  adminDashboard: "/admin/dashboard",
  adminCrm: "/admin/dashboard/crm",
  adminCrmLocation: (id: string) => `/admin/dashboard/crm/${encodeURIComponent(id)}`,
  adminReservations: "/admin/dashboard/reservations",
  adminClaims: "/admin/dashboard/claims",
  adminClaimQrs: "/admin/dashboard/claim-qrs",
  adminClaimQrsForLocation: (locationId: string) => `/admin/dashboard/claim-qrs?locationId=${encodeURIComponent(locationId)}`,

  reserveDashboard: "/reserve/dashboard",
  reserveDashboardReservations: "/reserve/dashboard/reservations",
  reserveBooking: (locationType: string, locationId: string) =>
    `/reserve/${encodeURIComponent(locationType)}/${encodeURIComponent(locationId)}`,
  reserveConfirmation: (token: string) => `/reserve/confirmation/${encodeURIComponent(token)}`,

  businessDashboard: "/business/dashboard",
  businessMenu: "/business/dashboard/menu",
  businessMenuForLocation: (locationId: string, key: "locationId" | "demoLocationId" | "adminLocationId" = "locationId") =>
    `/business/dashboard/menu?${key}=${encodeURIComponent(locationId)}`,
  businessQrCodes: "/business/dashboard/qr-codes",
  businessQrCodesForLocation: (locationId: string) => `/business/dashboard/qr-codes?locationId=${encodeURIComponent(locationId)}`,
  businessMarketingStudio: "/business/dashboard/marketing-studio",
  businessNotificationSettings: "/business/dashboard/settings/notifications",
  locationEditor: (locationType: string, locationId: string) =>
    `/locations/${encodeURIComponent(locationType)}/${encodeURIComponent(locationId)}/edit`,
  adminLocationDetail: (locationType: string, locationId: string) =>
    `/admin/dashboard/locations/${encodeURIComponent(locationType)}/${encodeURIComponent(locationId)}`,
} as const;

export const API_ROUTES = {
  adminEmailTemplatePreview: "/api/admin/email/templates/preview",
  reservePortalQrGenerate: "/api/reserve/portal/qr/generate",
  reservePortalQrRegenerate: "/api/reserve/portal/qr/regenerate",
  reservePortalReservations: "/api/reserve/portal/reservations",
  reservePortalReservationUpdate: "/api/reserve/portal/reservations/update",
  reservePortalLayout: "/api/reserve/portal/layout",
  reservePortalResources: "/api/reserve/portal/resources",
  reservePortalWaitlist: "/api/reservations/waitlist",
} as const;
