import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const requireText = (source, text, message) => {
  if (!source.includes(text)) throw new Error(message);
};
const forbidText = (source, text, message) => {
  if (source.includes(text)) throw new Error(message);
};

const nav = read("apps/admin/app/admin/dashboard/admin-navigation.ts");
const crmList = read("apps/admin/app/admin/dashboard/crm/page.tsx");
const crmDetail = read("apps/admin/app/admin/dashboard/crm/[id]/page.tsx");
const crmNew = read("apps/admin/app/admin/dashboard/crm/new/page.tsx");
const legacyList = read("apps/admin/app/admin/dashboard/locations/page.tsx");
const legacyDetail = read("apps/admin/app/admin/dashboard/locations/id/[locationId]/page.tsx");
const rootLegacyEdit = read("app/admin/dashboard/locations/edit/[type]/[locationId]/page.tsx");
const claimTools = read("apps/admin/app/admin/dashboard/claim-tools/ClaimToolsClient.tsx");
const workspaceNav = read("apps/admin/components/admin/location-workspace/LocationWorkspaceNavigation.tsx");

requireText(nav, 'label: "Locations CRM"', "Admin navigation must expose the canonical Locations CRM.");
forbidText(nav, 'label: "Locations"', "Admin navigation must not expose a competing Locations workspace.");

requireText(crmList, 'title={isSearchMode ? "Search Results" : "Locations CRM"}', "CRM must present itself as the canonical location directory.");
requireText(crmList, 'href="/admin/dashboard/crm/new"', "CRM must expose Add Location.");
requireText(crmList, 'Data & Import', "CRM must retain data/import access without a second Locations nav.");

requireText(crmDetail, "Edit Location", "CRM record must expose first-class location editing.");
requireText(crmDetail, "Save Location", "CRM location editor must provide an explicit save action.");
requireText(crmDetail, "Edit the canonical location record", "CRM location editor must explain canonical ownership.");
requireText(workspaceNav, '"Location Details"', "CRM workspace navigation must expose Location Details.");

requireText(crmNew, '.from("locations")', "Location creation must write the canonical locations model.");
requireText(crmNew, 'created_source: "admin_crm"', "CRM-created locations must have canonical source provenance.");
requireText(crmNew, 'public_visibility_tier: "internal"', "New CRM locations must fail closed to internal visibility.");
requireText(crmNew, "ADMIN_PAGE_ACCESS.crmEdit", "Location creation must require CRM edit permissions.");

requireText(legacyList, 'redirect("/admin/dashboard/crm")', "Legacy Locations directory must route into CRM.");
requireText(legacyDetail, 'redirect(\`/admin/dashboard/crm/\${locationId}\`)', "Legacy location detail must route into CRM.");
requireText(rootLegacyEdit, "?tab=profile", "Legacy location edit must route to CRM Location Details.");
requireText(claimTools, "?tab=profile", "Claim tools must edit locations through CRM.");

console.log("Admin CRM location workspace consolidation checks passed.");
