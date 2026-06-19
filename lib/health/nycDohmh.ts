import type { SupabaseClient } from "@supabase/supabase-js";

const NYC_DOHMH_ENDPOINT =
  "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const NYC_DOHMH_SOURCE_URL =
  "https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j";
const SELECT_FIELDS =
  "camis,dba,boro,building,street,zipcode,phone,cuisine_description,inspection_date,action,violation_code,violation_description,critical_flag,score,grade,grade_date,record_date,inspection_type";

type AnyRecord = Record<string, any>;

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

export async function importNycDohmhHealthData(options: {
  supabase: SupabaseClient;
  limit?: number;
  batchSize?: number;
  maxPages?: number;
  dryRun?: boolean;
  sinceDate?: string | null;
}): Promise<HealthImportSummary> {
  const supabase = options.supabase;
  const limit = options.limit ?? 5000;
  const batchSize = options.batchSize ?? 1000;
  const maxPages = options.maxPages ?? 5;
  const dryRun = options.dryRun ?? false;
  const summary: HealthImportSummary = {
    success: true,
    source: "nyc_dohmh",
    dryRun,
    fetchedCount: 0,
    processedCount: 0,
    matchedCount: 0,
    updatedLocationCount: 0,
    insertedInspectionCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
  };
  const runId = await startImportRun(
    supabase,
    {
      limit,
      batchSize,
      maxPages,
      dryRun,
      sinceDate: options.sinceDate ?? null,
    },
    summary,
  );
  try {
    const records = await fetchDohmhRecords({
      limit,
      batchSize,
      maxPages,
      sinceDate: options.sinceDate ?? null,
    });
    summary.fetchedCount = records.length;
    const locations = await fetchRestaurantLocations(supabase);
    const byCamis = new Map<string, AnyRecord>();
    const byPhone = new Map<string, AnyRecord[]>();
    const byAddress = new Map<string, AnyRecord[]>();
    for (const loc of locations) {
      const camis = clean(loc.health_department_camis);
      if (camis) byCamis.set(camis, loc);
      const phone = normalizePhone(loc.phone);
      if (phone) push(byPhone, phone, loc);
      const zip = normalizeZip(loc.zip_code ?? loc.zipcode ?? loc.postal_code);
      const street = normalizeStreet(loc.street ?? loc.address);
      const building = normalizeBuilding(
        loc.building ?? loc.street_number ?? loc.address,
      );
      if (zip && street && building)
        push(byAddress, `${zip}:${building}:${street}`, loc);
    }
    const inspectionRows: AnyRecord[] = [];
    const latestByCamis = new Map<
      string,
      { record: NycDohmhRecord; match: MatchResult }
    >();
    for (const record of records) {
      try {
        summary.processedCount++;
        const match = matchLocation(record, {
          byCamis,
          byPhone,
          byAddress,
          locations,
        });
        if (match.location && match.confidence >= 0.85) summary.matchedCount++;
        else summary.skippedCount++;
        const sourceRecordId = buildSourceRecordId(record);
        inspectionRows.push({
          location_id:
            match.confidence >= 0.85 ? (match.location?.id ?? null) : null,
          source: "nyc_dohmh",
          source_record_id: sourceRecordId,
          ...pickRecord(record),
          score: parseScore(record.score),
          grade: mapGrade(record.grade),
          inspection_date: toDate(record.inspection_date),
          grade_date: toDate(record.grade_date),
          record_date: toDate(record.record_date),
          match_confidence: match.confidence || null,
          matched_by: match.matchedBy || null,
          raw_payload: record,
        });
        if (record.camis && match.location && match.confidence >= 0.85) {
          const existing = latestByCamis.get(record.camis);
          if (!existing || compareSummaryRows(record, existing.record) > 0)
            latestByCamis.set(record.camis, { record, match });
        }
      } catch (e) {
        summary.failedCount++;
        summary.errors.push(errorMessage(e));
      }
    }
    if (!dryRun) {
      for (const chunk of chunks(inspectionRows, 500)) {
        const { error, count } = await supabase
          .from("location_health_inspections")
          .upsert(chunk, {
            onConflict: "source,source_record_id",
            count: "exact",
          });
        if (error) {
          summary.failedCount += chunk.length;
          summary.errors.push(error.message);
        } else summary.insertedInspectionCount += count ?? chunk.length;
      }
      for (const { record, match } of latestByCamis.values()) {
        const { error } = await supabase
          .from("locations")
          .update({
            health_department_grade: mapGrade(record.grade),
            health_department_score: parseScore(record.score),
            health_department_last_inspection_date: toDate(
              record.inspection_date,
            ),
            health_department_source: "NYC DOHMH",
            health_department_source_url: NYC_DOHMH_SOURCE_URL,
            health_department_updated_at: new Date().toISOString(),
            health_department_camis: record.camis ?? null,
            health_department_match_confidence: match.confidence,
            health_department_matched_by: match.matchedBy,
          })
          .eq("id", match.location!.id);
        if (error) {
          summary.failedCount++;
          summary.errors.push(error.message);
        } else summary.updatedLocationCount++;
      }
    }
  } catch (e) {
    summary.success = false;
    summary.errors.push(errorMessage(e));
  }
  summary.success = summary.success && summary.failedCount === 0;
  await finishImportRun(supabase, runId, summary).catch(() => undefined);
  return summary;
}

type MatchResult = {
  location: AnyRecord | null;
  confidence: number;
  matchedBy: string | null;
};
async function fetchDohmhRecords({
  limit,
  batchSize,
  maxPages,
  sinceDate,
}: {
  limit: number;
  batchSize: number;
  maxPages: number;
  sinceDate: string | null;
}) {
  const out: NycDohmhRecord[] = [];
  for (let page = 0; page < maxPages && out.length < limit; page++) {
    const pageLimit = Math.min(batchSize, limit - out.length);
    const url = new URL(NYC_DOHMH_ENDPOINT);
    url.searchParams.set("$limit", String(pageLimit));
    url.searchParams.set("$offset", String(page * batchSize));
    url.searchParams.set("$order", "inspection_date DESC");
    url.searchParams.set("$select", SELECT_FIELDS);
    if (sinceDate)
      url.searchParams.set(
        "$where",
        `inspection_date >= '${sinceDate}T00:00:00'`,
      );
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok)
      throw new Error(
        `NYC DOHMH fetch failed: ${res.status} ${res.statusText}`,
      );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageLimit) break;
  }
  return out;
}
async function fetchRestaurantLocations(supabase: SupabaseClient) {
  const cols =
    "id,name,restaurant_name,business_name,address,street,building,street_number,zip_code,zipcode,postal_code,phone,category,primary_category,cuisine,cuisine_type,location_type,type,health_department_camis";
  const { data, error } = await supabase
    .from("locations")
    .select(cols)
    .or(
      "location_type.eq.restaurant,type.eq.restaurant,category.ilike.%restaurant%,category.ilike.%food%,primary_category.ilike.%restaurant%,primary_category.ilike.%food%,cuisine_type.not.is.null,cuisine.not.is.null",
    )
    .limit(50000);
  if (error) {
    const fallback = await supabase.from("locations").select("*").limit(50000);
    if (fallback.error) throw fallback.error;
    return fallback.data ?? [];
  }
  return data ?? [];
}
function matchLocation(
  record: NycDohmhRecord,
  indexes: {
    byCamis: Map<string, AnyRecord>;
    byPhone: Map<string, AnyRecord[]>;
    byAddress: Map<string, AnyRecord[]>;
    locations: AnyRecord[];
  },
): MatchResult {
  const camis = clean(record.camis);
  if (camis && indexes.byCamis.has(camis))
    return {
      location: indexes.byCamis.get(camis)!,
      confidence: 1,
      matchedBy: "camis_existing",
    };
  const phone = normalizePhone(record.phone);
  if (phone && indexes.byPhone.get(phone)?.[0])
    return {
      location: indexes.byPhone.get(phone)![0],
      confidence: 0.95,
      matchedBy: "phone",
    };
  const zip = normalizeZip(record.zipcode);
  const street = normalizeStreet(record.street);
  const building = normalizeBuilding(record.building);
  const addr =
    zip && street && building
      ? indexes.byAddress.get(`${zip}:${building}:${street}`)?.[0]
      : null;
  if (addr)
    return { location: addr, confidence: 0.9, matchedBy: "address_zip" };
  let best: MatchResult = { location: null, confidence: 0, matchedBy: null };
  const name = normalizeName(record.dba);
  for (const loc of indexes.locations) {
    const lzip = normalizeZip(loc.zip_code ?? loc.zipcode ?? loc.postal_code);
    if (zip && lzip && zip !== lzip) continue;
    const lname = normalizeName(
      loc.name ?? loc.restaurant_name ?? loc.business_name,
    );
    const lstreet = normalizeStreet(loc.street ?? loc.address);
    const nameScore = similarity(name, lname);
    const streetScore = similarity(street, lstreet);
    const conf =
      zip && nameScore >= 0.82 && streetScore >= 0.82
        ? 0.86
        : nameScore >= 0.86 && streetScore >= 0.78
          ? 0.82
          : 0;
    if (conf > best.confidence)
      best = {
        location: loc,
        confidence: conf,
        matchedBy: conf >= 0.86 ? "name_address_zip" : "fuzzy_name_address",
      };
  }
  return best;
}
function buildSourceRecordId(r: NycDohmhRecord) {
  return `${r.camis}:${r.inspection_date || "missing"}:${r.violation_code || "none"}:${r.grade || "none"}:${r.score || "none"}`;
}
function pickRecord(r: NycDohmhRecord) {
  const {
    camis,
    dba,
    boro,
    building,
    street,
    zipcode,
    phone,
    cuisine_description,
    action,
    violation_code,
    violation_description,
    critical_flag,
    inspection_type,
  } = r;
  return {
    camis,
    dba,
    boro,
    building,
    street,
    zipcode,
    phone,
    cuisine_description,
    action,
    violation_code,
    violation_description,
    critical_flag,
    inspection_type,
  };
}
function mapGrade(v: unknown) {
  const g = clean(v).toUpperCase();
  if (!g) return null;
  if (["A", "B", "C"].includes(g)) return g;
  if (g === "N") return "Not Yet Graded";
  if (g === "Z" || g === "P") return "Grade Pending";
  return g;
}
function parseScore(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toDate(v: unknown) {
  const s = clean(v);
  return s ? s.slice(0, 10) : null;
}
function normalizeName(v: unknown) {
  return clean(v)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LLC|INC|RESTAURANT|BAR|CAFE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizePhone(v: unknown) {
  return clean(v)
    .replace(/\D/g, "")
    .replace(/^1(?=\d{10}$)/, "");
}
function normalizeZip(v: unknown) {
  return clean(v).match(/\d{5}/)?.[0] ?? "";
}
function normalizeBuilding(v: unknown) {
  return (
    clean(v)
      .toUpperCase()
      .match(/\d+[A-Z]?/)?.[0] ?? ""
  );
}
function normalizeStreet(v: unknown) {
  return clean(v)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(STREET|ST)\b/g, "ST")
    .replace(/\b(AVENUE|AVE)\b/g, "AVE")
    .replace(/\b(ROAD|RD)\b/g, "RD")
    .replace(/\b(BOULEVARD|BLVD)\b/g, "BLVD")
    .replace(/\b(PLACE|PL)\b/g, "PL")
    .replace(/\b(DRIVE|DR)\b/g, "DR")
    .replace(/\b(LANE|LN)\b/g, "LN")
    .replace(/\b(COURT|CT)\b/g, "CT")
    .replace(/\b(PARKWAY|PKWY)\b/g, "PKWY")
    .replace(/\s+/g, " ")
    .trim();
}
function compareSummaryRows(a: NycDohmhRecord, b: NycDohmhRecord) {
  const ad = Date.parse(String(a.inspection_date || "")) || 0,
    bd = Date.parse(String(b.inspection_date || "")) || 0;
  if (ad !== bd) return ad - bd;
  const ag = a.grade ? 1 : 0,
    bg = b.grade ? 1 : 0;
  if (ag !== bg) return ag - bg;
  const as = parseScore(a.score) == null ? 0 : 1,
    bs = parseScore(b.score) == null ? 0 : 1;
  if (as !== bs) return as - bs;
  return (
    clean(a.violation_description).length -
    clean(b.violation_description).length
  );
}
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const aa = new Set(a.split(" ")),
    bb = new Set(b.split(" "));
  const inter = [...aa].filter((x) => bb.has(x)).length;
  return inter / Math.max(aa.size, bb.size);
}
function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const arr = map.get(key) ?? [];
  arr.push(value);
  map.set(key, arr);
}
function chunks<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function clean(v: unknown) {
  return String(v ?? "").trim();
}
function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
async function startImportRun(
  supabase: SupabaseClient,
  metadata: AnyRecord,
  summary: HealthImportSummary,
) {
  if (metadata.dryRun) return null;
  const { data, error } = await supabase
    .from("health_intelligence_import_runs")
    .insert({
      source: "nyc_dohmh",
      status: "running",
      requested_limit: metadata.limit,
      metadata,
    })
    .select("id")
    .maybeSingle();
  if (error) summary.errors.push(error.message);
  return data?.id ?? null;
}
async function finishImportRun(
  supabase: SupabaseClient,
  runId: string | null,
  summary: HealthImportSummary,
) {
  if (!runId) return;
  await supabase
    .from("health_intelligence_import_runs")
    .update({
      status: summary.success ? "completed" : "failed",
      finished_at: new Date().toISOString(),
      fetched_count: summary.fetchedCount,
      processed_count: summary.processedCount,
      matched_count: summary.matchedCount,
      updated_location_count: summary.updatedLocationCount,
      inserted_inspection_count: summary.insertedInspectionCount,
      skipped_count: summary.skippedCount,
      failed_count: summary.failedCount,
      error: summary.errors.slice(0, 20).join("\n") || null,
      metadata: { errors: summary.errors.slice(0, 100) },
    })
    .eq("id", runId);
}
