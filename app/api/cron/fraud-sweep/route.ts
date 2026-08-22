import { NextRequest, NextResponse } from "next/server";
import { recordFraudSignal } from "@/lib/fraud";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  let reportBursts = 0;
  let identityReuse = 0;
  let recalculated = 0;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: reports, error: reportError } = await supabaseAdmin
      .from("fraud_reports")
      .select("subject_type,subject_id,reporter_fingerprint,created_at")
      .gte("created_at", since);
    if (reportError) throw reportError;

    const reportGroups = new Map<string, Set<string>>();
    for (const report of reports || []) {
      const key = `${report.subject_type}:${report.subject_id}`;
      const set = reportGroups.get(key) || new Set<string>();
      set.add(report.reporter_fingerprint || `anonymous:${report.created_at}`);
      reportGroups.set(key, set);
    }

    for (const [key, reporters] of reportGroups) {
      if (reporters.size < 3) continue;
      const [subjectType, ...subjectIdParts] = key.split(":");
      const subjectId = subjectIdParts.join(":");
      await recordFraudSignal({
        subjectType: subjectType as any,
        subjectId,
        signalType: "report_burst",
        category: "abuse",
        source: "fraud_sweep",
        ruleKey: "report_burst",
        severity: reporters.size >= 6 ? 4 : 3,
        scoreDelta: Math.min(45, 15 + reporters.size * 5),
        evidence: { independent_reporters_24h: reporters.size },
        dedupeKey: `report-burst:${new Date().toISOString().slice(0, 10)}:${key}`,
      });
      reportBursts += 1;
    }

    const { data: identities, error: identityError } = await supabaseAdmin
      .from("fraud_identity_links")
      .select("identity_type,identity_hash,subject_type,subject_id")
      .order("last_seen_at", { ascending: false })
      .limit(5000);
    if (identityError) throw identityError;

    const identityGroups = new Map<string, Array<{ subject_type: string; subject_id: string }>>();
    for (const identity of identities || []) {
      const key = `${identity.identity_type}:${identity.identity_hash}`;
      const group = identityGroups.get(key) || [];
      group.push({ subject_type: identity.subject_type, subject_id: identity.subject_id });
      identityGroups.set(key, group);
    }

    for (const [identityKey, links] of identityGroups) {
      const unique = new Map(links.map((link) => [`${link.subject_type}:${link.subject_id}`, link]));
      if (unique.size < 3) continue;
      for (const link of unique.values()) {
        await recordFraudSignal({
          subjectType: link.subject_type as any,
          subjectId: link.subject_id,
          signalType: "identity_reuse",
          category: "identity",
          source: "fraud_sweep",
          ruleKey: link.subject_type === "user" ? "user_identity_reuse" : "linked_bad_actor",
          severity: 4,
          scoreDelta: Math.min(55, 20 + unique.size * 5),
          evidence: { linked_subject_count: unique.size, identity_type: identityKey.split(":")[0] },
          dedupeKey: `identity-sweep:${identityKey}:${link.subject_type}:${link.subject_id}`,
        });
        identityReuse += 1;
      }
    }

    const { data: subjects, error: subjectError } = await supabaseAdmin.from("fraud_subjects").select("subject_type,subject_id").limit(5000);
    if (subjectError) throw subjectError;
    for (const subject of subjects || []) {
      const { error } = await supabaseAdmin.rpc("fraud_recalculate_subject", { p_subject_type: subject.subject_type, p_subject_id: subject.subject_id });
      if (error) throw error;
      recalculated += 1;
    }

    return NextResponse.json({
      ok: true,
      reportBursts,
      identityReuse,
      recalculated,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fraud_sweep_failed";
    console.error("fraud sweep failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
