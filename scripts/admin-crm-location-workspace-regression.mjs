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
const communicationPanel = read("apps/admin/app/admin/dashboard/crm/[id]/CommunicationPanel.tsx");
const crmEmailComposer = read("apps/admin/app/admin/dashboard/crm/[id]/CrmEmailComposer.tsx");
const crmEmailSendRoute = read("apps/admin/app/api/admin/crm/email/send/route.ts");

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

requireText(communicationPanel, '/call', "Selected-location Communications must expose the 3CX call action.");
requireText(communicationPanel, 'Send SMS', "Selected-location Communications must expose SMS for the active location.");
requireText(communicationPanel, 'Email this location', "Selected-location Communications must expose email for the active location.");
requireText(crmEmailComposer, '/api/admin/crm/email/send', "Selected-location email composer must use the CRM email endpoint.");
requireText(crmEmailSendRoute, '.eq("id", locationId)', "CRM email endpoint must resolve only the selected location.");
requireText(crmEmailSendRoute, 'recipient_type: "location"', "CRM email sends must be logged against the selected location.");
requireText(crmEmailSendRoute, 'requireAdminRole(CRM_WRITE_ROLES)', "CRM email endpoint must require CRM write permission.");

const crmCallButton = read("apps/admin/app/admin/dashboard/crm/[id]/call/CrmCallButton.tsx");
const crmCallInitiateRoute = read("apps/admin/app/api/admin/crm/calls/initiate/route.ts");
const crmSmsRecipientsRoute = read("apps/admin/app/api/admin/crm/sms/recipients/route.ts");
const crmSmsSendRoute = read("apps/admin/app/api/admin/crm/sms/send/route.ts");
const isolatedAdminCrm = read("apps/admin/lib/admin-crm.ts");

requireText(crmCallButton, "/api/admin/crm/calls/initiate", "3CX call action must record a location-scoped call before opening the dialer.");
requireText(crmCallInitiateRoute, 'source_system: "3cx"', "3CX call initiation must write CRM call activity.");
requireText(crmCallInitiateRoute, 'recipient_type: "location"', "3CX call initiation must write the selected location communication history.");
requireText(crmSmsRecipientsRoute, 'crm_account_locations', "Location SMS recipients must be resolved from the selected location account.");
requireText(crmSmsSendRoute, 'sendCrmSms', "Selected-location SMS must use the CRM Telnyx channel.");
requireText(crmSmsSendRoute, 'recipient_type: "location"', "Selected-location SMS must write location communication history.");
requireText(crmSmsSendRoute, 'source_system: "crm_sms"', "Selected-location SMS must write CRM activity history.");
requireText(isolatedAdminCrm, '.eq("source_system", "3cx")', "Location Communications must include 3CX activity rows.");
