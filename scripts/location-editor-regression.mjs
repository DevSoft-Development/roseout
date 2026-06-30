import { readFileSync } from 'node:fs';

const page = readFileSync('app/locations/[type]/[locationId]/edit/page.tsx', 'utf8');
const redirect = readFileSync('app/locations/edit/[type]/[locationId]/page.tsx', 'utf8');
const api = readFileSync('app/api/locations/edit-context/route.ts', 'utf8');

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
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (failures.length) {
  console.error(`\n${failures.length} location editor regression check(s) failed.`);
  process.exit(1);
}
