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
const profileEditor = read("apps/admin/components/admin/LocationProfileEditor.tsx");
const outreachPage = read("apps/admin/app/admin/dashboard/crm/outreach/page.tsx");
const communicationCenter = read("apps/admin/components/admin/crm/CommunicationCenter.tsx");
const communicationCenterRoute = read("apps/admin/app/api/admin/crm/communication-center/route.ts");
const tasksRedirect = read("apps/admin/app/admin/dashboard/crm/tasks/page.tsx");
const myWork = read("apps/admin/app/admin/dashboard/crm/my-work/page.tsx");
const salesWorkspace = read("apps/admin/app/admin/dashboard/crm/sales/page.tsx");

requireText(nav, 'label: "Locations CRM"', "Admin navigation must expose the canonical Locations CRM.");
forbidText(nav, 'label: "Locations"', "Admin navigation must not expose a competing Locations workspace.");

requireText(crmList, 'title={isSearchMode ? "Search Results" : "Locations CRM"}', "CRM must present itself as the canonical location directory.");
requireText(crmList, 'href="/admin/dashboard/crm/new"', "CRM must expose Add Location.");
requireText(crmList, 'Data & Import', "CRM must retain data/import access without a second Locations nav.");

requireText(crmDetail, "Edit Location", "CRM record must expose first-class location editing.");
requireText(crmDetail, "Save changes", "CRM location editor must provide a clear save action.");
requireText(crmDetail, "Location profile", "CRM location editor must present the canonical profile workspace.");
requireText(crmDetail, "primarySectionsOpen={true}", "Search and AI controls must be first-class on the profile page.");
requireText(crmDetail, "sticky bottom-3 z-40", "Save changes must remain sticky while editing the profile.");
requireText(crmDetail, 'showSearchAndMatching={false}', "More settings must not duplicate Search & matching.");
requireText(profileEditor, "Search & matching", "Location profile editor must retain Search & matching controls.");
requireText(profileEditor, "AI profile helper", "Location profile editor must retain the AI helper.");
requireText(profileEditor, "primarySectionsOpen", "Location profile editor must support visible primary controls.");
requireText(workspaceNav, '"Location Details"', "CRM workspace navigation must expose Location Details.");
requireText(workspaceNav, 'activeTab === "sales"', "CRM workspace navigation must highlight Sales for the selected CRM location.");
requireText(workspaceNav, 'activeTab === "tasks"', "CRM workspace navigation must highlight Tasks for the selected CRM location.");
requireText(workspaceNav, 'location=', "CRM task navigation must remain scoped to the selected CRM location.");
requireText(workspaceNav, 'location_id=', "CRM sales navigation must remain scoped to the selected CRM location.");
requireText(workspaceNav, '/admin/dashboard/crm/tasks?location_id=', "CRM task navigation must carry the selected location through the Tasks compatibility route.");
requireText(outreachPage, 'locationId={p.location_id}', "Selected-location Communications must pass location context into the communication center.");
requireText(communicationCenter, 'params.set("location_id", locationId)', "Communication Center requests must preserve selected location context.");
requireText(communicationCenter, 'const openHref = locationId && scope === "crm"', "Communication Center actions must remain scoped to the selected CRM location.");
requireText(communicationCenterRoute, 'url.searchParams.get("location_id")', "Communication Center API must accept selected location context.");
requireText(communicationCenterRoute, 'item.locationId === requestedLocationId', "Core API communication results must be filtered to the selected location.");
requireText(communicationCenterRoute, 'String(row.location_id || "") === requestedLocationId', "Database communication results must be filtered to the selected location.");

requireText(crmNew, '.from("locations")', "Location creation must write the canonical locations model.");
requireText(crmNew, 'created_source: "admin_crm"', "CRM-created locations must have canonical source provenance.");
requireText(crmNew, 'public_visibility_tier: "internal"', "New CRM locations must fail closed to internal visibility.");
requireText(crmNew, "ADMIN_PAGE_ACCESS.crmEdit", "Location creation must require CRM edit permissions.");

requireText(legacyList, 'redirect("/admin/dashboard/crm")', "Legacy Locations directory must route into CRM.");
requireText(legacyDetail, 'redirect(\`/admin/dashboard/crm/\${locationId}\`)', "Legacy location detail must route into CRM.");
requireText(rootLegacyEdit, "?tab=profile", "Legacy location edit must route to CRM Location Details.");
requireText(claimTools, "?tab=profile", "Claim tools must edit locations through CRM.");

console.log("Admin CRM location workspace consolidation checks passed.");

requireText(tasksRedirect, 'params.location_id || params.location', "Tasks redirect must preserve the selected CRM location.");
requireText(tasksRedirect, 'next.set("location", selectedLocation)', "Tasks redirect must pass selected location into My Work.");
requireText(myWork, 'location_id=', "Selected-location task creation and detail links must preserve location context.");
requireText(salesWorkspace, 'type="hidden" name="location_id"', "Sales filters must preserve selected location context.");
requireText(salesWorkspace, 'Clear search', "Selected-location Sales must clear search without clearing location scope.");
