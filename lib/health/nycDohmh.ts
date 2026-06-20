type SupabaseClientLike = {
  from: (table: string) => any;
};

export type NycDohmhRecord = {
  camis?: string | null;
  dba?: string | null;
  boro?: string | null;
  building?: string | null;
  street?: string | null;
  zipcode?: string | null;
  phone?: string | null;
  cuisine_description?: string | null;
  inspection_date?: string | null;
  action?: string | null;
  violation_code?: string | null;
  violation_description?: string | null;
  critical_flag?: string | null;
  score?: string | number | null;
  grade?: string | null;
  grade_date?: string | null;
  record_date?: string | null;
  inspection_type?: string | null;
};

export type HealthImportSummary = {
  success: boolean;
  source: "nyc_dohmh";
  dryRun: boolean;
  fetchedCount: number;
  processedCount: number;
  matchedCount: number;
  updatedLocationCount: number;
  insertedInspectionCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
};

type LocationCandidate = Record<string, any> & { id: string };

const ENDPOINT = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const SOURCE_URL = "https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j";
const SELECT_FIELDS = "camis,dba,boro,building,street,zipcode,phone,cuisine_description,inspection_date,action,violation_code,violation_description,critical_flag,score,grade,grade_date,record_date,inspection_type";

function normalizeName(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\b(llc|inc|restaurant|bar|cafe)\b/g, " ").replace(/\s+/g, " ").trim();
}
function digits(value: unknown) { return String(value || "").replace(/\D/g, ""); }
function zip5(value: unknown) { return digits(value).slice(0, 5); }
function normalizeStreet(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\b(STREET|ST)\b/g, "ST").replace(/\b(AVENUE|AVE)\b/g, "AVE")
    .replace(/\b(ROAD|RD)\b/g, "RD").replace(/\b(BOULEVARD|BLVD)\b/g, "BLVD")
    .replace(/\b(PLACE|PL)\b/g, "PL").replace(/\b(DRIVE|DR)\b/g, "DR")
    .replace(/\b(LANE|LN)\b/g, "LN").replace(/\b(COURT|CT)\b/g, "CT")
    .replace(/\b(PARKWAY|PKWY)\b/g, "PKWY").replace(/\s+/g, " ").trim();
}
function parseDate(value: unknown) { return value ? String(value).slice(0, 10) : null; }
function parseScore(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.round(n) : null; }
function mapGrade(value: unknown) {
  const grade = String(value || "").trim().toUpperCase();
  if (!grade) return null;
  if (["A", "B", "C"].includes(grade)) return grade;
  if (grade === "N") return "Not Yet Graded";
  if (grade === "Z" || grade === "P") return "Grade Pending";
  return grade;
}
function sourceRecordId(record: NycDohmhRecord) {
  return `${record.camis || "missing"}:${record.inspection_date || "missing"}:${record.violation_code || "none"}:${record.grade || "none"}:${record.score || "none"}`;
}
function bestDateMs(record: NycDohmhRecord) { return Date.parse(String(record.inspection_date || "")) || 0; }
function isBetterSummary(a: NycDohmhRecord, b?: NycDohmhRecord) {
  if (!b) return true;
  if (bestDateMs(a) !== bestDateMs(b)) return bestDateMs(a) > bestDateMs(b);
  if (a.grade && !b.grade) return true;
  if (a.score !== null && a.score !== undefined && (b.score === null || b.score === undefined)) return true;
  return JSON.stringify(a).length > JSON.stringify(b).length;
}
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aw = new Set(a.split(" ").filter(Boolean));
  const bw = new Set(b.split(" ").filter(Boolean));
  const both = [...aw].filter((w) => bw.has(w)).length;
  return both / Math.max(aw.size, bw.size, 1);
}
function locName(loc: LocationCandidate) { return loc.name || loc.title || loc.location_name || loc.restaurant_name || loc.business_name || ""; }
function locAddress(loc: LocationCandidate) { return loc.address || loc.formatted_address || loc.street_address || loc.address_line_1 || ""; }
function isLikelyRestaurant(loc: LocationCandidate) {
  const haystack = [loc.location_type, loc.type, loc.category, loc.categories, loc.primary_category].flat().join(" ").toLowerCase();
  return /restaurant|food|dining|bar|cafe|lounge/.test(haystack);
}
function matchRecord(record: NycDohmhRecord, locations: LocationCandidate[]) {
  const camis = String(record.camis || "").trim();
  const phone = digits(record.phone).slice(-10);
  const zip = zip5(record.zipcode);
  const street = normalizeStreet(`${record.building || ""} ${record.street || ""}`);
  const name = normalizeName(record.dba);
  let best: { location: LocationCandidate; confidence: number; matchedBy: string } | null = null;
  for (const loc of locations.filter(isLikelyRestaurant)) {
    const locCamis = String(loc.health_department_camis || "").trim();
    const locPhone = digits(loc.phone).slice(-10);
    const locZip = zip5(loc.postal_code || loc.zip || loc.zip_code);
    const locStreet = normalizeStreet(locAddress(loc));
    const locNameNorm = normalizeName(locName(loc));
    let confidence = 0;
    let matchedBy = "";
    if (camis && locCamis === camis) { confidence = 1; matchedBy = "camis_existing"; }
    else if (phone && locPhone && phone === locPhone) { confidence = 0.95; matchedBy = "phone"; }
    else if (zip && locZip === zip && street && locStreet.includes(street)) { confidence = 0.9; matchedBy = "address_zip"; }
    else if (zip && locZip === zip && similarity(name, locNameNorm) >= 0.65 && similarity(street, locStreet) >= 0.5) { confidence = 0.86; matchedBy = "name_address_zip"; }
    else if (similarity(name, locNameNorm) >= 0.75 && similarity(street, locStreet) >= 0.5) { confidence = 0.82; matchedBy = "fuzzy_name_address"; }
    if (confidence > (best?.confidence || 0)) best = { location: loc, confidence, matchedBy };
  }
  return best;
}
async function fetchLocations(supabase: SupabaseClientLike) {
  const broad = "id,name,title,location_name,restaurant_name,business_name,address,formatted_address,street_address,address_line_1,city,state,postal_code,zip,zip_code,phone,location_type,type,category,categories,primary_category,health_department_camis";
  let result = await supabase.from("locations").select(broad).limit(20000);
  if (result.error) {
    result = await supabase.from("locations").select("id,name,title,location_name,address,formatted_address,street_address,address_line_1,city,state,postal_code,zip,phone,location_type,type,category,health_department_camis").limit(20000);
  }
  if (result.error) throw new Error(result.error.message);
  return (result.data || []) as LocationCandidate[];
}
async function fetchPage(limit: number, offset: number, sinceDate?: string | null) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));
  url.searchParams.set("$order", "inspection_date DESC");
  url.searchParams.set("$select", SELECT_FIELDS);
  if (sinceDate) url.searchParams.set("$where", `inspection_date >= '${sinceDate}T00:00:00'`);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`NYC DOHMH fetch failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as NycDohmhRecord[];
}
async function upsertInspection(supabase: SupabaseClientLike, row: Record<string, unknown>) {
  const upsert = await supabase.from("location_health_inspections").upsert(row, { onConflict: "source,source_record_id" });
  if (!upsert.error) return;
  const existing = await supabase.from("location_health_inspections").select("id").eq("source", row.source).eq("source_record_id", row.source_record_id).maybeSingle();
  if (existing.data?.id) {
    const update = await supabase.from("location_health_inspections").update(row).eq("id", existing.data.id);
    if (update.error) throw new Error(update.error.message);
  } else {
    const insert = await supabase.from("location_health_inspections").insert(row);
    if (insert.error) throw new Error(insert.error.message);
  }
}

export async function importNycDohmhHealthData(options: { supabase: SupabaseClientLike; limit?: number; batchSize?: number; maxPages?: number; dryRun?: boolean; sinceDate?: string | null; }): Promise<HealthImportSummary> {
  const { supabase } = options;
  const limit = Math.max(1, options.limit ?? 5000);
  const batchSize = Math.max(1, options.batchSize ?? 1000);
  const maxPages = Math.max(1, options.maxPages ?? 5);
  const dryRun = Boolean(options.dryRun ?? false);
  const summary: HealthImportSummary = { success: true, source: "nyc_dohmh", dryRun, fetchedCount: 0, processedCount: 0, matchedCount: 0, updatedLocationCount: 0, insertedInspectionCount: 0, skippedCount: 0, failedCount: 0, errors: [] };
  let runId: string | null = null;
  try {
    if (!dryRun) {
      const run = await supabase.from("health_intelligence_import_runs").insert({ source: "nyc_dohmh", status: "running", requested_limit: limit, metadata: { sinceDate: options.sinceDate || null } }).select("id").maybeSingle();
      runId = run.data?.id || null;
    }
    const locations = await fetchLocations(supabase);
    const summaries = new Map<string, { record: NycDohmhRecord; match: ReturnType<typeof matchRecord> }>();
    for (let page = 0; page < maxPages && summary.fetchedCount < limit; page++) {
      const pageLimit = Math.min(batchSize, limit - summary.fetchedCount);
      const records = await fetchPage(pageLimit, page * batchSize, options.sinceDate);
      summary.fetchedCount += records.length;
      if (records.length === 0) break;
      for (const record of records) {
        try {
          summary.processedCount++;
          const match = matchRecord(record, locations);
          if (match) summary.matchedCount++;
          if (!match || match.confidence < 0.85) summary.skippedCount++;
          const inspectionRow = { location_id: match && match.confidence >= 0.85 ? match.location.id : null, source: "nyc_dohmh", source_record_id: sourceRecordId(record), camis: record.camis || null, dba: record.dba || null, boro: record.boro || null, building: record.building || null, street: record.street || null, zipcode: record.zipcode || null, phone: record.phone || null, cuisine_description: record.cuisine_description || null, inspection_date: parseDate(record.inspection_date), action: record.action || null, violation_code: record.violation_code || null, violation_description: record.violation_description || null, critical_flag: record.critical_flag || null, score: parseScore(record.score), grade: mapGrade(record.grade), grade_date: parseDate(record.grade_date), record_date: parseDate(record.record_date), inspection_type: record.inspection_type || null, match_confidence: match?.confidence || null, matched_by: match?.matchedBy || null, raw_payload: record, updated_at: new Date().toISOString() };
          if (!dryRun) { await upsertInspection(supabase, inspectionRow); summary.insertedInspectionCount++; }
          if (match && match.confidence >= 0.85 && record.camis && isBetterSummary(record, summaries.get(record.camis)?.record)) summaries.set(record.camis, { record, match });
        } catch (error) { summary.failedCount++; summary.errors.push(error instanceof Error ? error.message : String(error)); }
      }
    }
    if (!dryRun) {
      for (const { record, match } of summaries.values()) {
        if (!match || match.confidence < 0.85) continue;
        const update = await supabase.from("locations").update({ health_department_grade: mapGrade(record.grade), health_department_score: parseScore(record.score), health_department_last_inspection_date: parseDate(record.inspection_date), health_department_source: "NYC DOHMH", health_department_source_url: SOURCE_URL, health_department_updated_at: new Date().toISOString(), health_department_camis: record.camis || null, health_department_match_confidence: match.confidence, health_department_matched_by: match.matchedBy }).eq("id", match.location.id);
        if (update.error) { summary.failedCount++; summary.errors.push(update.error.message); } else summary.updatedLocationCount++;
      }
      if (runId) await supabase.from("health_intelligence_import_runs").update({ status: summary.failedCount ? "failed" : "completed", finished_at: new Date().toISOString(), fetched_count: summary.fetchedCount, processed_count: summary.processedCount, matched_count: summary.matchedCount, updated_location_count: summary.updatedLocationCount, inserted_inspection_count: summary.insertedInspectionCount, skipped_count: summary.skippedCount, failed_count: summary.failedCount, error: summary.errors[0] || null, metadata: { dryRun, sinceDate: options.sinceDate || null } }).eq("id", runId);
    }
  } catch (error) {
    summary.success = false; summary.failedCount++; summary.errors.push(error instanceof Error ? error.message : String(error));
    if (runId) await supabase.from("health_intelligence_import_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: summary.errors[0] }).eq("id", runId);
  }
  summary.success = summary.success && summary.failedCount === 0;
  return summary;
}
