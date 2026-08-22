import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_INTERNAL_SECRET = requireEnv("WORKER_INTERNAL_SECRET");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

const SUBJECT_TYPES = new Set(["user","location","claim","organizer","event","experience","reservation","order","payment","payout","review","other"]);

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") ?? "", WORKER_INTERNAL_SECRET)) return json({ success: false, error: "Unauthorized" }, 401);

  try {
    const body = await request.json();
    const subjectType = text(body.subject_type, 40);
    const subjectId = text(body.subject_id, 256);
    const ruleKey = text(body.rule_key, 100);
    const signalType = text(body.signal_type, 100);
    const source = text(body.source || "internal", 100);
    const relatedSubjectType = body.related_subject_type ? text(body.related_subject_type, 40) : null;
    const relatedSubjectId = body.related_subject_id ? text(body.related_subject_id, 256) : null;
    const dedupeKey = body.dedupe_key ? text(body.dedupe_key, 300) : null;
    const severity = integer(body.severity, 1, 5);
    const scoreDelta = integer(body.score_delta, -100, 100);
    const confidence = number(body.confidence ?? 1, 0, 1);
    const evidence = object(body.evidence ?? {});

    if (!SUBJECT_TYPES.has(subjectType)) throw new InputError("Invalid subject_type");
    if (!subjectId) throw new InputError("subject_id is required");
    if (!ruleKey) throw new InputError("rule_key is required");
    if (!signalType) throw new InputError("signal_type is required");
    if (relatedSubjectType && !SUBJECT_TYPES.has(relatedSubjectType)) throw new InputError("Invalid related_subject_type");
    if (relatedSubjectType && !relatedSubjectId) throw new InputError("related_subject_id is required with related_subject_type");
    if (!relatedSubjectType && relatedSubjectId) throw new InputError("related_subject_type is required with related_subject_id");
    if (JSON.stringify(evidence).length > 32768) throw new InputError("evidence is too large");

    const { data: rule, error: ruleError } = await supabase.from("fraud_rules").select("rule_key,subject_type,category,enabled").eq("rule_key", ruleKey).maybeSingle();
    if (ruleError) throw ruleError;
    if (!rule || !rule.enabled) throw new InputError("Unknown or disabled fraud rule");
    if (rule.subject_type !== "other" && rule.subject_type !== subjectType) throw new InputError("Rule is not valid for this subject_type");

    const signal = {
      subject_type: subjectType,
      subject_id: subjectId,
      related_subject_type: relatedSubjectType,
      related_subject_id: relatedSubjectId,
      rule_key: ruleKey,
      signal_type: signalType,
      category: rule.category,
      source,
      severity: severity ?? 1,
      score_delta: scoreDelta ?? 0,
      confidence,
      evidence,
      dedupe_key: dedupeKey,
      observed_at: new Date().toISOString(),
    };

    let signalId: string | null = null;
    let duplicate = false;
    if (dedupeKey) {
      const { data, error } = await supabase.from("fraud_signals").upsert(signal, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw error;
      signalId = data?.id ?? null;
      duplicate = !data;
    } else {
      const { data, error } = await supabase.from("fraud_signals").insert(signal).select("id").single();
      if (error) throw error;
      signalId = data.id;
    }

    const { data: subject, error: subjectError } = await supabase.from("fraud_subjects").select("risk_score,risk_band,enforcement_state,active_case_id,updated_at").eq("subject_type", subjectType).eq("subject_id", subjectId).maybeSingle();
    if (subjectError) throw subjectError;

    return json({ success: true, duplicate, signal_id: signalId, subject });
  } catch (error) {
    if (error instanceof InputError) return json({ success: false, error: error.message }, 400);
    const message = error instanceof Error ? error.message : String(error);
    console.error("fraud-signal failed", { error: message });
    return json({ success: false, error: "Internal fraud signal failure" }, 500);
  }
});

class InputError extends Error {}
function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length > max) throw new InputError(`Field exceeds ${max} characters`);
  return normalized;
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new InputError(`Expected integer ${min}..${max}`);
  return Number(value);
}
function number(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new InputError(`Expected number ${min}..${max}`);
  return parsed;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("evidence must be an object");
  return value as Record<string, unknown>;
}
function secureCompare(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
