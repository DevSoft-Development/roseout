import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-worker-secret, x-worker-job-id, x-worker-job-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";
const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") ?? "", workerSecret)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = await request.json().catch(() => ({}));
    const jobType = String(body.job_type || request.headers.get("x-worker-job-type") || "").trim();
    const payload = isObject(body.payload) ? body.payload : body;
    const limit = clamp(payload.limit, 25, 1, 100);
    const dryRun = Boolean(payload.dry_run ?? payload.dryRun);

    const result = await execute(jobType, payload, limit, dryRun);
    return json({ success: true, job_type: jobType, dry_run: dryRun, ...result });
  } catch (error) {
    return json({ success: false, error: message(error) }, 500);
  }
});

async function execute(jobType: string, payload: Row, limit: number, dryRun: boolean): Promise<Row> {
  switch (jobType) {
    case "search.document_rebuild": return rebuildSearchDocuments(limit, dryRun);
    case "search.embedding_generation": return generateEmbeddings(limit, dryRun);
    case "analytics.aggregate": return aggregateAnalytics();
    case "enrichment.ai_profile": return enrichProfiles(limit, dryRun);
    case "enrichment.ai_menu": return extractMenus(limit, dryRun);
    case "ml.duplicate_detection.recalculate": return detectDuplicates(limit, dryRun);
    case "review.moderation": return moderateReviews(limit, dryRun);
    case "location.publishability_repair": return repairPublishability(limit, dryRun);
    default: throw new Error(`Unsupported operations worker job type: ${jobType}`);
  }
}

async function fetchRows(table: string, limit: number): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select("*").limit(limit);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as Row[];
}

async function updateExisting(table: string, row: Row, patch: Row, dryRun: boolean): Promise<boolean> {
  const safe = Object.fromEntries(Object.entries(patch).filter(([key, value]) => key in row && value !== undefined));
  if (!Object.keys(safe).length || dryRun) return false;
  const { error } = await supabase.from(table).update(safe).eq("id", row.id);
  if (error) throw new Error(`${table}:${row.id}: ${error.message}`);
  return true;
}

function locationName(row: Row): string { return String(row.name || row.restaurant_name || row.activity_name || "").trim(); }
function normalize(value: unknown): string { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function textArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(",").map((part) => part.trim()).filter(Boolean) : []; }

async function rebuildSearchDocuments(limit: number, dryRun: boolean) {
  const rows = await fetchRows("locations", limit);
  let updated = 0;
  for (const row of rows) {
    const document = [locationName(row), row.primary_category, row.cuisine, row.activity_type, row.address, row.city, row.state, ...textArray(row.tags), ...textArray(row.vibe_tags), ...textArray(row.best_for_tags)].filter(Boolean).join(" | ");
    if (!document || document === row.search_document) continue;
    if (await updateExisting("locations", row, { search_document: document, search_document_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }, dryRun)) updated += 1;
  }
  return { scanned: rows.length, updated, remaining_hint: rows.length === limit };
}

async function repairPublishability(limit: number, dryRun: boolean) {
  const rows = await fetchRows("locations", limit);
  let updated = 0;
  for (const row of rows) {
    const hasName = Boolean(locationName(row));
    const hasAddress = Boolean(row.address || (row.city && row.state));
    const hasPhoto = Boolean(row.image_url || row.main_image || row.has_photos === true || row.photo_status === "has_photo");
    const supported = !/doctor|dentist|lawyer|church|school|store|retail|auto|parking/i.test([row.location_type, row.primary_category, row.google_types].flat().join(" "));
    const ready = hasName && hasAddress && hasPhoto && supported && row.data_status !== "invalid";
    const patch = {
      has_photos: hasPhoto,
      photo_status: hasPhoto ? "has_photo" : "missing_photo",
      publish_ready: ready,
      is_searchable: ready,
      is_hidden: !ready,
      visibility_tier: ready ? "searchable" : "hidden",
      quality_status: ready ? "publish_ready" : hasPhoto ? "needs_review" : "needs_photo",
      updated_at: new Date().toISOString(),
    };
    if (await updateExisting("locations", row, patch, dryRun)) updated += 1;
  }
  return { scanned: rows.length, updated, remaining_hint: rows.length === limit };
}

async function detectDuplicates(limit: number, dryRun: boolean) {
  const rows = await fetchRows("locations", Math.min(limit * 4, 400));
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${normalize(locationName(row))}|${normalize(row.address)}|${normalize(row.city)}`;
    if (key === "||") continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const candidates = [...groups.values()].filter((group) => group.length > 1).slice(0, limit).map((group) => ({ canonical_id: group[0].id, duplicate_ids: group.slice(1).map((row) => row.id), normalized_key: `${normalize(locationName(group[0]))}|${normalize(group[0].address)}|${normalize(group[0].city)}` }));
  let persisted = 0;
  if (!dryRun) {
    for (const candidate of candidates) {
      const { error } = await supabase.from("worker_job_events").insert({ job_id: null, event_type: "duplicate.candidate", metadata: candidate });
      if (!error) persisted += 1;
    }
  }
  return { scanned: rows.length, candidate_groups: candidates.length, persisted, candidates };
}

async function moderateReviews(limit: number, dryRun: boolean) {
  const rows = await fetchRows("reviews", limit);
  let updated = 0;
  let flagged = 0;
  for (const row of rows) {
    const contentKey = ["content", "comment", "review", "body", "text"].find((key) => key in row);
    const statusKey = ["moderation_status", "status", "review_status"].find((key) => key in row);
    if (!contentKey || !statusKey) continue;
    const text = String(row[contentKey] ?? "");
    const repeated = /(.)\1{7,}/i.test(text) || /(https?:\/\/|www\.)/i.test(text);
    const abusive = /\b(fuck|shit|bitch|asshole|nigger|faggot)\b/i.test(text);
    const next = abusive || repeated ? "pending" : "approved";
    if (next === "pending") flagged += 1;
    if (row[statusKey] !== next && await updateExisting("reviews", row, { [statusKey]: next, moderation_reason: abusive ? "profanity" : repeated ? "spam_signal" : null, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() }, dryRun)) updated += 1;
  }
  return { scanned: rows.length, updated, flagged, remaining_hint: rows.length === limit };
}

async function aggregateAnalytics() {
  const { data, error } = await supabase.from("worker_jobs").select("status,job_type,created_at,started_at,completed_at").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const byStatus = rows.reduce((acc: Row, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
  const durations = rows.map((row) => row.started_at && row.completed_at ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime() : 0).filter((value) => value > 0);
  return { window_hours: 24, jobs: rows.length, by_status: byStatus, average_runtime_ms: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0 };
}

async function enrichProfiles(limit: number, dryRun: boolean) {
  if (!openAiKey) throw new Error("OPENAI_API_KEY is required for AI profile enrichment");
  const rows = (await fetchRows("locations", limit * 3)).filter((row) => locationName(row) && !(row.description || row.short_description)).slice(0, limit);
  let updated = 0;
  for (const row of rows) {
    const result = await openAiJson(`Create concise structured discovery metadata for this outing location. Return JSON with description (max 70 words), tags (max 8), best_for (max 6), and vibes (max 6). Location: ${JSON.stringify({ name: locationName(row), category: row.primary_category, cuisine: row.cuisine, activity_type: row.activity_type, address: row.address, city: row.city })}`);
    const patch = { description: result.description, short_description: result.description, tags: result.tags, best_for_tags: result.best_for, vibe_tags: result.vibes, ai_enriched_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (await updateExisting("locations", row, patch, dryRun)) updated += 1;
  }
  return { candidates: rows.length, updated, remaining_hint: rows.length === limit };
}

async function extractMenus(limit: number, dryRun: boolean) {
  if (!openAiKey) throw new Error("OPENAI_API_KEY is required for AI menu extraction");
  const rows = (await fetchRows("locations", limit * 4)).filter((row) => row.menu_text && !row.menu_data).slice(0, limit);
  let updated = 0;
  for (const row of rows) {
    const result = await openAiJson(`Extract this menu into JSON with categories, each containing name and items. Each item may contain name, description, price, and dietary_tags. Do not invent missing values. Menu: ${String(row.menu_text).slice(0, 12000)}`);
    if (await updateExisting("locations", row, { menu_data: result, menu_extracted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, dryRun)) updated += 1;
  }
  return { candidates: rows.length, updated, remaining_hint: rows.length === limit };
}

async function generateEmbeddings(limit: number, dryRun: boolean) {
  if (!openAiKey) throw new Error("OPENAI_API_KEY is required for embedding generation");
  const rows = (await fetchRows("locations", limit * 3)).filter((row) => row.search_document && !row.embedding).slice(0, limit);
  let updated = 0;
  for (const row of rows) {
    const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small", input: String(row.search_document).slice(0, 8000) }) });
    if (!response.ok) throw new Error(`OpenAI embeddings returned ${response.status}: ${await response.text()}`);
    const body = await response.json();
    const embedding = body?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new Error("OpenAI returned no embedding");
    if (await updateExisting("locations", row, { embedding, embedding_model: Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small", embedding_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }, dryRun)) updated += 1;
  }
  return { candidates: rows.length, updated, remaining_hint: rows.length === limit };
}

async function openAiJson(prompt: string): Promise<Row> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: Deno.env.get("OPENAI_WORKER_MODEL") || "gpt-4.1-mini", response_format: { type: "json_object" }, temperature: 0.2, messages: [{ role: "system", content: "Return valid JSON only. Preserve facts and never invent unsupported details." }, { role: "user", content: prompt }] }) });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");
  return JSON.parse(content);
}

function isObject(value: unknown): value is Row { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function clamp(value: unknown, fallback: number, min: number, max: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function secureCompare(left: string, right: string): boolean { if (!left || !right || left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
