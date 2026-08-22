import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_INTERNAL_SECRET = requireEnv("WORKER_INTERNAL_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") ?? "", WORKER_INTERNAL_SECRET)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const startedAt = Date.now();
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const dayKey = now.toISOString().slice(0, 10);
  let reportBursts = 0;
  let identityReuse = 0;
  let recalculated = 0;

  try {
    const { data: reports, error: reportError } = await supabase
      .from("fraud_reports")
      .select("subject_type,subject_id,reporter_fingerprint,created_at")
      .gte("created_at", since)
      .limit(10000);
    if (reportError) throw reportError;

    const reportGroups = new Map<string, Set<string>>();
    for (const report of reports ?? []) {
      const key = `${report.subject_type}:${report.subject_id}`;
      const reporters = reportGroups.get(key) ?? new Set<string>();
      reporters.add(report.reporter_fingerprint || `anonymous:${report.created_at}`);
      reportGroups.set(key, reporters);
    }

    for (const [key, reporters] of reportGroups) {
      if (reporters.size < 3) continue;
      const separator = key.indexOf(":");
      if (separator <= 0) continue;
      const subjectType = key.slice(0, separator);
      const subjectId = key.slice(separator + 1);
      await insertSignal({
        subject_type: subjectType,
        subject_id: subjectId,
        rule_key: "report_burst",
        signal_type: "report_burst",
        category: "abuse",
        source: "fraud_sweep",
        severity: reporters.size >= 6 ? 4 : 3,
        score_delta: Math.min(45, 15 + reporters.size * 5),
        evidence: { independent_reporters_24h: reporters.size },
        dedupe_key: `report-burst:${dayKey}:${key}`,
      });
      reportBursts += 1;
    }

    const { data: identities, error: identityError } = await supabase
      .from("fraud_identity_links")
      .select("identity_type,identity_hash,subject_type,subject_id")
      .order("last_seen_at", { ascending: false })
      .limit(5000);
    if (identityError) throw identityError;

    const identityGroups = new Map<string, Array<{ subject_type: string; subject_id: string }>>();
    for (const identity of identities ?? []) {
      const key = `${identity.identity_type}:${identity.identity_hash}`;
      const links = identityGroups.get(key) ?? [];
      links.push({ subject_type: identity.subject_type, subject_id: identity.subject_id });
      identityGroups.set(key, links);
    }

    for (const [identityKey, links] of identityGroups) {
      const unique = new Map(links.map((link) => [`${link.subject_type}:${link.subject_id}`, link]));
      if (unique.size < 3) continue;
      const identityType = identityKey.slice(0, identityKey.indexOf(":"));
      for (const link of unique.values()) {
        await insertSignal({
          subject_type: link.subject_type,
          subject_id: link.subject_id,
          rule_key: link.subject_type === "user" ? "user_identity_reuse" : "linked_bad_actor",
          signal_type: "identity_reuse",
          category: "identity",
          source: "fraud_sweep",
          severity: 4,
          score_delta: Math.min(55, 20 + unique.size * 5),
          evidence: { linked_subject_count: unique.size, identity_type: identityType },
          dedupe_key: `identity-sweep:${identityKey}:${link.subject_type}:${link.subject_id}`,
        });
        identityReuse += 1;
      }
    }

    const { data: subjects, error: subjectError } = await supabase
      .from("fraud_subjects")
      .select("subject_type,subject_id")
      .limit(5000);
    if (subjectError) throw subjectError;

    for (const subject of subjects ?? []) {
      const { error } = await supabase.rpc("fraud_recalculate_subject", {
        p_subject_type: subject.subject_type,
        p_subject_id: subject.subject_id,
      });
      if (error) throw error;
      recalculated += 1;
    }

    return json({
      success: true,
      reportBursts,
      identityReuse,
      recalculated,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("fraud-sweep failed", { error: message });
    return json({ success: false, error: message, durationMs: Date.now() - startedAt }, 500);
  }
});

async function insertSignal(signal: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("fraud_signals").upsert(signal, {
    onConflict: "dedupe_key",
    ignoreDuplicates: true,
  });
  if (error) throw error;
}

function secureCompare(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
