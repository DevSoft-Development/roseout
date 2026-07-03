import { readFileSync } from 'node:fs';

const page = readFileSync('app/locations/[type]/[locationId]/edit/page.tsx', 'utf8');
const redirect = readFileSync('app/locations/edit/[type]/[locationId]/page.tsx', 'utf8');
const api = readFileSync('app/api/locations/edit-context/route.ts', 'utf8');
const links = readFileSync('lib/location-editor-links.ts', 'utf8');
const mobileNav = readFileSync('components/location-editor/LocationEditorMobileNav.tsx', 'utf8');
const promotions = readFileSync('app/business/dashboard/promotions/page.tsx', 'utf8');
const impersonate = readFileSync('app/api/admin/impersonate/route.ts', 'utf8');
const stopImpersonation = readFileSync('app/api/admin/stop-impersonation/route.ts', 'utf8');

const checks = [
  ['singular restaurant normalizes to restaurants', page.includes('value === "restaurants" || value === "restaurant"')],
  ['plural restaurants route loads editor', page.includes('type === "restaurants"') && page.includes('/api/locations/edit-context')],
  ['singular activity normalizes to activities', page.includes('value === "activities" || value === "activity"')],
  ['legacy edit redirect points to canonical editor', redirect.includes('/locations/${canonicalLocationType(type)}/${encodeURIComponent(locationId)}/edit')],
  ['editor avoids raw object rendering helper', page.includes('humanizeValue') && !page.includes('[object Object]')],
  ['editor has public preview link', page.includes('publicPreviewHref') && page.includes('View Public Page')],
  ['editor has save button', page.includes('Save Changes') && page.includes('saveLocation')],
  ['editor has reservation controls', page.includes('Internal reservations') && page.includes('External reservations')],
  ['editor has photos controls', page.includes('Add Gallery Image URL') && page.includes('Set main') && page.includes('Remove')],
  ['canonical edit context is preserved', api.includes('profileUpdateWithSearchDocument') && api.includes('savedTo: "locations"')],
  [
    'edit context returns explicit canonical and source IDs',
    api.includes('canonicalId') &&
      api.includes('sourceId') &&
      api.includes('effectiveId: canonicalId || sourceId || finalId') &&
      !api.includes('canonicalId = String(data.id || finalId)')
  ],
  ['dashboard links use canonical ID helper', links.includes('const dashboardId = explicitDashboardId || canonicalId || locationId') && links.includes('withDashboardContext("/business/dashboard/menu")')],
  ['admin context no longer defaults to demo mode', links.includes('isDemoMode = false') && !links.includes('isDemoMode = adminContext')],
  ['real admin mode emits adminLocationMode without demo params', links.includes('params.set("adminLocationMode", "1")') && links.includes('params.delete("demo")') && links.includes('params.delete("fromDemoCenter")')],
  ['true demo mode still emits demo params', links.includes('params.set("demo", "1")') && links.includes('params.set("fromDemoCenter"')],
  [
    'location editor imports link helper and passes admin context',
    page.includes('import { buildLocationEditorLinks } from "@/lib/location-editor-links"') &&
      page.includes('canonicalId: canonicalId || undefined') &&
      page.includes('sourceId') &&
      page.includes('effectiveId') &&
      page.includes('adminContext: isAdminContext') &&
      page.includes('searchParams.get("demo") === "1"') &&
      page.includes('searchParams.get("fromDemoCenter") === "1"') &&
      !page.includes('Boolean(adminLocationIdParam);')
  ],
  [
    'location editor does not initialize canonicalId from route id',
    page.includes('const [canonicalId, setCanonicalId] = useState("")') &&
      !page.includes('const [canonicalId, setCanonicalId] = useState(locationId)')
  ],

  [
    'location editor desktop sidebar and content use matching lg breakpoint',
    page.includes('lg:block') &&
      page.includes('<section className="min-h-screen lg:pl-[256px]"') &&
      !page.includes('min-h-screen xl:pl-[256px]')
  ],
  [
    'location editor uses extracted mobile nav without a dead hamburger',
    page.includes('LocationEditorMobileNav links={links}') &&
      mobileNav.includes('aria-label="Open editor menu"') &&
      mobileNav.includes('onClick={() => setOpen(true)}') &&
      mobileNav.includes('window.addEventListener("keydown", onKeyDown)')
  ],
  [
    'mobile nav only renders backdrop while open and closes on link click',
    mobileNav.includes('{open ? (') &&
      mobileNav.includes('className="absolute inset-0 bg-black/70 backdrop-blur-sm"') &&
      mobileNav.includes('onClick={() => setOpen(false)}')
  ],
  [
    'desktop and mobile nav share editor nav section data',
    page.includes('getEditorNavSections(links)') &&
      mobileNav.includes('export function getEditorNavSections')
  ],
  [
    'editor links avoid invalid placeholders',
    !links.includes('javascript:void(0)') &&
      !mobileNav.includes('javascript:void(0)') &&
      !page.includes('href={undefined}')
  ],
  [
    'same-page hash tabs have matching scroll targets',
    page.includes('href: "#details"') && page.includes('id="details" className="scroll-mt-36') &&
      page.includes('href: "#public-profile"') && page.includes('id="public-profile"') &&
      page.includes('href: "#photos"') && page.includes('id="photos"') &&
      page.includes('href: "#hours"') && page.includes('id="hours"')
  ],
  ['promotions uses Growth Pro wrapper', promotions.includes('BusinessGrowthProPage') && promotions.includes('module="promotions"') && !promotions.includes('redirect("/login")')],
  [
    'admin location impersonation does not require owner user',
    impersonate.includes('\"admin_location\"') &&
      impersonate.includes('.from("locations")') &&
      impersonate.includes('target_user_id: null') &&
      impersonate.includes('Admin location mode started')
  ],
  [
    'stop impersonation clears location mode cookies',
    stopImpersonation.includes('theouthaven_impersonate_location_id') &&
      stopImpersonation.includes('theouthaven_impersonate_location_type') &&
      stopImpersonation.includes('theouthaven_impersonate_target_type')
  ],
  ['no Rose/Roseout naming introduced', !page.includes('Roseout') && !links.includes('Roseout') && !mobileNav.includes('Roseout')],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (failures.length) {
  console.error(`\n${failures.length} location editor regression check(s) failed.`);
  process.exit(1);
}
