import fs from "node:fs";

const nav = fs.readFileSync("apps/business/app/locations/dashboard/CanonicalLocationModuleNav.tsx", "utf8");
const hubFiles = [
  "apps/business/app/locations/dashboard/business-setup/page.tsx",
  "apps/business/app/locations/dashboard/customers/page.tsx",
  "apps/business/app/locations/dashboard/marketing-growth/page.tsx",
];

const primaryItemCount = (nav.match(/\bicon: [A-Z]/g) || []).length;
const requiredPrimaryRoutes = [
  "/locations/dashboard/events-experiences",
  "/locations/dashboard/menu",
  "/locations/dashboard/website",
  "/locations/dashboard/messaging",
  "/locations/dashboard/reservations",
  "/locations/dashboard/reservations/settings",
  "/locations/dashboard/profile",
  "/locations/dashboard/business-setup",
  "/locations/dashboard/customers",
  "/locations/dashboard/reviews",
  "/locations/dashboard/marketing-growth",
  "/locations/dashboard/analytics",
  "/locations/dashboard/billing",
  "/locations/dashboard/support",
  "/locations/dashboard/settings",
];
const childRoutes = [
  "/locations/dashboard/reservations/large-group-bookings",
  "/locations/dashboard/branding",
  "/locations/dashboard/domains",
  "/locations/dashboard/qr-codes",
  "/locations/dashboard/leads",
  "/locations/dashboard/offers",
  "/locations/dashboard/vip",
  "/locations/dashboard/notifications",
  "/locations/dashboard/marketing-studio",
  "/locations/dashboard/social-accounts",
  "/locations/dashboard/promotions",
];

const checks = {
  exactly16PrimaryWorkspaces: primaryItemCount === 16,
  requiredPrimaryRoutesPresent: requiredPrimaryRoutes.every((route) => nav.includes(`href: "${route}"`)),
  consolidatedChildRoutesMapped: childRoutes.every((route) => nav.includes(route)),
  hubPagesExist: hubFiles.every((file) => fs.existsSync(file)),
  reservationTabsNotDuplicatedInSidebar:
    !nav.includes('label: "Today"') &&
    !nav.includes('label: "Calendar"') &&
    !nav.includes('label: "Waitlist"') &&
    !nav.includes('label: "Floor / Tables / Spaces"'),
  pageSpecificStateIsDroppedBetweenWorkspaces:
    nav.includes('params.delete("tab")') &&
    nav.includes('params.delete("section")') &&
    nav.includes('params.delete("host")'),
};

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
console.log(JSON.stringify({ primaryItemCount, checks, failed }, null, 2));
if (failed.length) process.exit(1);
