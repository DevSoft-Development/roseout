import { readFileSync } from 'node:fs';

const page = readFileSync('app/locations/[type]/[locationId]/edit/page.tsx', 'utf8');
const legacy = readFileSync('app/locations/[type]/[locationId]/edit/LegacyEditLocationPage.tsx', 'utf8');
const clean = readFileSync('components/location-editor/CleanLocationEditor.tsx', 'utf8');
const config = readFileSync('components/location-editor/editor-config.ts', 'utf8');
const links = readFileSync('lib/location-editor-links.ts', 'utf8');
const mobileNav = readFileSync('components/location-editor/LocationEditorMobileNav.tsx', 'utf8');

const noInvalidHref = (text) => !text.includes('javascript:void(0)') && !text.includes('href="#"') && !text.includes('href={undefined}') && !text.includes('href=""');
const checks = [
  ['route page is a fresh shell wrapper', page.includes('CleanLocationEditor') && !page.includes('saveLocation')],
  ['old editor moved to LegacyEditLocationPage', legacy.includes('export default function EditLocationPage') && legacy.includes('saveLocation')],
  ['fresh editor reuses edit-context load API', clean.includes('/api/locations/edit-context?type=') && clean.includes('{ cache: "no-store" }')],
  ['fresh editor reuses edit-context PATCH save API', clean.includes('fetch("/api/locations/edit-context"') && clean.includes('method: "PATCH"')],
  ['singular restaurant normalizes to restaurants', clean.includes('value === "restaurants" || value === "restaurant"')],
  ['singular activity normalizes to activities', clean.includes('value === "activities" || value === "activity"')],
  ['demo mode detected from demo and fromDemoCenter params', clean.includes('searchParams.get("demo") === "1"') && clean.includes('searchParams.get("fromDemoCenter") === "1"')],
  ['demo context passed to link builder', clean.includes('isDemoMode') && clean.includes('fromDemoCenter') && clean.includes('adminLocationId: adminLocationIdParam') && clean.includes('searchParams')],
  ['normal editor links do not include demo params', links.includes('if ((!isDemoMode && !adminContext) || !locationId) return href') && links.includes('params.delete("demo")')],
  ['demo editor links include demo=1 and fromDemoCenter=1', links.includes('params.set("demo", "1")') && links.includes('params.set("fromDemoCenter"')],
  ['demo public preview and menu use context helper', links.includes('publicPage: withContext(`/locations/${type}/${publicId}`)') && links.includes('menuViewer: withContext(`/locations/${type}/${publicId}/menu`)')],
  ['demo back/cancel points to dashboard link', clean.includes('const cancelHref = isDemoMode ? links.dashboard : from') && links.includes('dashboard: withDashboardContext("/locations/dashboard")')],
  ['active links avoid empty/hash placeholders and javascript urls', noInvalidHref(clean) && noInvalidHref(config) && noInvalidHref(mobileNav) && noInvalidHref(links)],
  ['required hash nav items configured with section ids', config.includes('href: "#details", sectionId: "details"') && config.includes('href: "#public-profile", sectionId: "public-profile"') && config.includes('href: "#photos", sectionId: "photos"') && config.includes('href: "#hours", sectionId: "hours"')],
  ['hash nav items have matching rendered section ids', clean.includes('id="details"') && clean.includes('id="public-profile"') && clean.includes('id="photos"') && clean.includes('id="hours"')],
  ['mobile nav button renders', mobileNav.includes('aria-label="Open editor menu"') && mobileNav.includes('onClick={() => setOpen(true)}')],
  ['mobile nav opens and closes', mobileNav.includes('{open ? (') && mobileNav.includes('onClick={() => setOpen(false)}') && mobileNav.includes('onClick={() => setOpen(false)} className="grid')],
  ['desktop sidebar and content use matching lg breakpoint', readFileSync('components/location-editor/LocationEditorNav.tsx', 'utf8').includes('lg:block') && clean.includes('lg:pl-[280px]')],
  ['old unverified marketing/user links removed from fresh nav', !config.includes('Campaigns') && !config.includes('Promotions') && !config.includes('Email') && !config.includes('SMS') && !config.includes('Roles') && !config.includes('Brand Settings')],
  ['no Roseout naming introduced', !page.includes('Roseout') && !clean.includes('Roseout') && !config.includes('Roseout') && !mobileNav.includes('Roseout')],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (failures.length) {
  console.error(`\n${failures.length} location editor regression check(s) failed.`);
  process.exit(1);
}
