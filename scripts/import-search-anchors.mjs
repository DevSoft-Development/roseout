import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
function normalizeAnchorText(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function normalizeAliasList(values) { const seen = new Set(); return values.map(normalizeAnchorText).filter((value) => value && !seen.has(value) && seen.add(value)); }

const TYPES = new Set(["restaurant","activity","landmark","stadium","arena","park","beach","mall","theater","museum","hotel","transit_hub","university","event_venue","neighborhood","airport","attraction"]);
const STRATEGIES = new Set(["dense_urban","urban","stadium","mall","beach","large_park","suburban","long_island","transit","airport"]);

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const file = arg("--file");
const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--validate");
if (!file) throw new Error("Usage: npm run anchors:import -- --file data/search-anchors/nyc-li-wave-1.csv [--dry-run]");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (q && c === '"' && n === '"') { cell += '"'; i++; continue; }
    if (c === '"') { q = !q; continue; }
    if (!q && c === ",") { row.push(cell); cell = ""; continue; }
    if (!q && (c === "\n" || c === "\r")) { if (c === "\r" && n === "\n") i++; row.push(cell); if (row.some((x) => x.length)) rows.push(row); row = []; cell = ""; continue; }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...body] = rows;
  return body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

const records = parseCsv(fs.readFileSync(file, "utf8"));
const names = new Map();
const aliases = new Map();
const errors = [];
const rows = records.map((r, idx) => {
  const line = idx + 2;
  const normalized_name = normalizeAnchorText(r.canonical_name);
  if (!normalized_name) errors.push(`line ${line}: canonical_name is required`);
  if (names.has(normalized_name)) errors.push(`line ${line}: duplicate canonical_name ${r.canonical_name}`);
  names.set(normalized_name, line);
  if (!TYPES.has(r.anchor_type)) errors.push(`line ${line}: invalid anchor_type ${r.anchor_type}`);
  if (!STRATEGIES.has(r.radius_strategy)) errors.push(`line ${line}: invalid radius_strategy ${r.radius_strategy}`);
  const latitude = Number(r.latitude), longitude = Number(r.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.push(`line ${line}: invalid latitude`);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.push(`line ${line}: invalid longitude`);
  const cleanAliases = normalizeAliasList(String(r.aliases || "").split(/[|;]/).filter(Boolean));
  for (const a of cleanAliases) {
    const owner = aliases.get(a);
    if (owner && owner !== normalized_name) errors.push(`line ${line}: alias collision ${a} with ${owner}`);
    aliases.set(a, normalized_name);
  }
  return { canonical_name: r.canonical_name.trim(), normalized_name, aliases: cleanAliases, anchor_type: r.anchor_type, city: r.city || null, state: r.state || null, borough: r.borough || null, neighborhood: r.neighborhood || null, county: r.county || null, market: r.market || null, latitude, longitude, default_radius_miles: Number(r.default_radius_miles), max_radius_miles: Number(r.max_radius_miles), radius_strategy: r.radius_strategy, priority: Number(r.priority || 50), source_type: "import", review_status: r.review_status || "pending_review", metadata: { import_batch: file, source_name: r.source_name, source_url: r.source_url, coordinate_source: r.source_name } };
});
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({ file, dryRun, validated: rows.length, preview: rows.slice(0, 5).map((r) => r.canonical_name) }, null, 2));
if (!dryRun) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for import");
  const supabase = createClient(url, key);
  const { error } = await supabase.from("search_anchors").upsert(rows, { onConflict: "normalized_name" });
  if (error) throw error;
  console.log(JSON.stringify({ imported: rows.length }, null, 2));
}
