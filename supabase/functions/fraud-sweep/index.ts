import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_INTERNAL_SECRET = requireEnv("WORKER_INTERNAL_SECRET");
const PAGE_SIZE = 1000;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!secureCompare(request.headers.get("x-worker-secret") ?? "", WORKER_INTERNAL_SECRET)) return json({ success: false, error: "Unauthorized" }, 401);

  const startedAtMs = Date.now();
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staleCutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const overlapCutoff = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const dayKey = now.toISOString().slice(0, 10);

  const { error: staleError } = await supabase
    .from("fraud_detection_runs")
    .update({ status: "failed", error_message: "Marked stale before next sweep", completed_at: now.toISOString() })
    .eq("run_type", "fraud_sweep")
    .eq("status", "running")
    .lt("started_at", staleCutoff);
  if (staleError) return json({ success: false, error: "Unable to reconcile stale fraud sweeps" }, 500);

  const { data: activeRun, error: activeRunError } = await supabase.from("fraud_detection_runs").select("id,started_at").eq("run_type", "fraud_sweep").eq("status", "running").gte("started_at", overlapCutoff).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (activeRunError) return json({ success: false, error: "Unable to check fraud sweep lock" }, 500);
  if (activeRun) return json({ success: true, skipped: true, reason: "already_running", active_run_id: activeRun.id }, 200);

  const { data: run, error: runError } = await supabase.from("fraud_detection_runs").insert({ run_type: "fraud_sweep", status: "running", source: "supabase_edge" }).select("id").single();
  if (runError?.code === "23505") return json({ success: true, skipped: true, reason: "already_running" }, 200);
  if (runError || !run) return json({ success: false, error: "Unable to create fraud sweep run" }, 500);

  const runId = run.id;
  const metrics: Record<string, number> = { reportsScanned: 0, identitiesScanned: 0, subjectsScored: 0, reportBursts: 0, identityReuse: 0, linkedBadActors: 0, signalsCreated: 0, casesOpened: 0 };

  try {
    const casesBefore = await countCases();
    const candidates: Record<string, unknown>[] = [];

    const reportGroups = new Map<string, Set<string>>();
    for (let from = 0;; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("fraud_reports").select("subject_type,subject_id,reporter_fingerprint,created_at").gte("created_at", since24h).order("created_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      metrics.reportsScanned += rows.length;
      for (const report of rows) {
        const key = `${report.subject_type}:${report.subject_id}`;
        const reporters = reportGroups.get(key) ?? new Set<string>();
        reporters.add(report.reporter_fingerprint || `anonymous:${report.created_at}`);
        reportGroups.set(key, reporters);
      }
      if (rows.length < PAGE_SIZE) break;
    }

    for (const [key, reporters] of reportGroups) {
      if (reporters.size < 3) continue;
      const separator = key.indexOf(":");
      if (separator <= 0) continue;
      const subjectType = key.slice(0, separator);
      const subjectId = key.slice(separator + 1);
      candidates.push({ subject_type: subjectType, subject_id: subjectId, rule_key: "report_burst", signal_type: "report_burst", category: "abuse", source: "fraud_sweep", severity: reporters.size >= 6 ? 4 : 3, score_delta: Math.min(45, 15 + reporters.size * 5), confidence: 1, evidence: { independent_reporters_24h: reporters.size }, dedupe_key: `report-burst:${dayKey}:${key}`, observed_at: now.toISOString() });
      metrics.reportBursts += 1;
    }

    const identityGroups = new Map<string, Array<{ subject_type: string; subject_id: string }>>();
    for (let from = 0;; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("fraud_identity_links").select("identity_type,identity_hash,subject_type,subject_id,last_seen_at").gte("last_seen_at", since30d).order("last_seen_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      metrics.identitiesScanned += rows.length;
      for (const identity of rows) {
        const key = `${identity.identity_type}:${identity.identity_hash}`;
        const links = identityGroups.get(key) ?? [];
        links.push({ subject_type: identity.subject_type, subject_id: identity.subject_id });
        identityGroups.set(key, links);
      }
      if (rows.length < PAGE_SIZE) break;
    }

    const knownBad = new Set<string>();
    for (let from = 0;; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("fraud_subjects")
        .select("subject_type,subject_id,enforcement_state,risk_score")
        .or("enforcement_state.in.(banned,suspended),risk_score.gte.85")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const subject of rows) knownBad.add(`${subject.subject_type}:${subject.subject_id}`);
      if (rows.length < PAGE_SIZE) break;
    }

    const principalTypes = new Set(["user", "claim", "location", "organizer"]);
    const badActorPropagationTypes = new Set(["email_hash", "phone_hash", "device_hash", "payment_fingerprint"]);

    for (const [identityKey, links] of identityGroups) {
      const separator = identityKey.indexOf(":");
      const identityType = separator > 0 ? identityKey.slice(0, separator) : identityKey;
      const unique = new Map(links.map((link) => [`${link.subject_type}:${link.subject_id}`, link]));

      const userLinks = [...unique.values()].filter((link) => link.subject_type === "user");
      const userThreshold = identityType === "email_hash" || identityType === "phone_hash"
        ? 2
        : identityType === "device_hash" || identityType === "payment_fingerprint"
          ? 3
          : identityType === "ip_hash"
            ? 8
            : 4;
      if (userLinks.length >= userThreshold) {
        const severity = identityType === "ip_hash" ? 3 : 4;
        const scoreDelta = identityType === "ip_hash" ? 25 : Math.min(55, 25 + userLinks.length * 5);
        for (const link of userLinks) {
          candidates.push({ subject_type: "user", subject_id: link.subject_id, rule_key: "user_identity_reuse", signal_type: "identity_reuse", category: "identity", source: "fraud_sweep", severity, score_delta: scoreDelta, confidence: 1, evidence: { linked_user_count: userLinks.length, identity_type: identityType }, dedupe_key: `identity-user-sweep:${dayKey}:${identityKey}:${link.subject_id}`, observed_at: now.toISOString() });
          metrics.identityReuse += 1;
        }
      }

      const claimLinks = [...unique.values()].filter((link) => link.subject_type === "claim");
      if (claimLinks.length >= 5) {
        for (const link of claimLinks) {
          candidates.push({ subject_type: "claim", subject_id: link.subject_id, rule_key: "claim_takeover_attempt", signal_type: "claim_identity_reuse", category: "account_takeover", source: "fraud_sweep", severity: claimLinks.length >= 8 ? 4 : 3, score_delta: Math.min(45, 20 + claimLinks.length * 4), confidence: 0.85, evidence: { linked_claim_count: claimLinks.length, identity_type: identityType }, dedupe_key: `identity-claim-sweep:${dayKey}:${identityKey}:${link.subject_id}`, observed_at: now.toISOString() });
          metrics.identityReuse += 1;
        }
      }

      if (badActorPropagationTypes.has(identityType) && [...unique.keys()].some((key) => knownBad.has(key))) {
        for (const [subjectKey, link] of unique) {
          if (knownBad.has(subjectKey) || !principalTypes.has(link.subject_type)) continue;
          candidates.push({ subject_type: link.subject_type, subject_id: link.subject_id, rule_key: "linked_bad_actor", signal_type: "linked_bad_actor", category: "network", source: "fraud_sweep", severity: 4, score_delta: 40, confidence: 0.9, evidence: { identity_type: identityType, linked_to_known_bad_actor: true }, dedupe_key: `known-bad-link:${dayKey}:${identityKey}:${subjectKey}`, observed_at: now.toISOString() });
          metrics.linkedBadActors += 1;
        }
      }
    }

    for (let index = 0; index < candidates.length; index += 500) {
      const batch = candidates.slice(index, index + 500);
      const { data, error } = await supabase.from("fraud_signals").upsert(batch, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      metrics.signalsCreated += data?.length ?? 0;
    }

    for (let from = 0;; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("fraud_subjects").select("subject_type,subject_id").order("updated_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const subject of rows) {
        const { error: recalcError } = await supabase.rpc("fraud_recalculate_subject", { p_subject_type: subject.subject_type, p_subject_id: subject.subject_id });
        if (recalcError) throw recalcError;
        metrics.subjectsScored += 1;
      }
      if (rows.length < PAGE_SIZE) break;
    }

    const casesAfter = await countCases();
    metrics.casesOpened = Math.max(0, casesAfter - casesBefore);
    const durationMs = Date.now() - startedAtMs;
    const { error: completionError } = await supabase
      .from("fraud_detection_runs")
      .update({ status: "succeeded", metrics: { ...metrics, durationMs }, completed_at: new Date().toISOString(), error_message: null })
      .eq("id", runId);
    if (completionError) throw new Error(`Unable to finalize fraud sweep telemetry: ${completionError.message}`);
    return json({ success: true, run_id: runId, ...metrics, durationMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startedAtMs;
    console.error("fraud-sweep failed", { runId, error: message });
    const { error: failureWriteError } = await supabase
      .from("fraud_detection_runs")
      .update({ status: "failed", metrics: { ...metrics, durationMs }, error_message: message.slice(0, 2000), completed_at: new Date().toISOString() })
      .eq("id", runId);
    if (failureWriteError) console.error("fraud-sweep telemetry failure write failed", { runId, error: failureWriteError.message });
    return json({ success: false, run_id: runId, error: "Fraud sweep failed", durationMs }, 500);
  }
});

async function countCases(): Promise<number> {
  const { count, error } = await supabase.from("fraud_cases").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
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
