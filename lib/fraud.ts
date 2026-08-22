import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type FraudSubjectType =
  | "user"
  | "location"
  | "claim"
  | "organizer"
  | "event"
  | "experience"
  | "reservation"
  | "order"
  | "payment"
  | "payout"
  | "review"
  | "other";

export type FraudSignalInput = {
  subjectType: FraudSubjectType;
  subjectId: string;
  signalType: string;
  category: string;
  source: string;
  ruleKey?: string | null;
  severity?: number;
  scoreDelta?: number;
  confidence?: number;
  evidence?: Record<string, unknown>;
  dedupeKey?: string | null;
  relatedSubjectType?: FraudSubjectType | null;
  relatedSubjectId?: string | null;
  expiresAt?: string | null;
};

export type FraudDecisionLevel =
  | "allow"
  | "monitor"
  | "step_up_verification"
  | "manual_review"
  | "hold"
  | "block";

export type FraudDecision = {
  subjectType: FraudSubjectType;
  subjectId: string;
  decision: FraudDecisionLevel;
  riskScore: number;
  riskBand: string;
  enforcementState: string;
  activeCaseId: string | null;
  activeCaseStatus: string | null;
  actionType: string | null;
  reasonCode: string;
};

const OPEN_CASE_STATUSES = new Set(["open", "investigating", "awaiting_evidence", "actioned", "appealed"]);
const ACTION_DECISIONS: Record<string, FraudDecisionLevel> = {
  ban: "block",
  suspend: "block",
  remove_content: "block",
  hold_publication: "hold",
  hold_payout: "hold",
  require_verification: "step_up_verification",
  limit_account: "step_up_verification",
  monitor: "monitor",
  clear: "allow",
  restore: "allow",
};

export async function recordFraudSignal(input: FraudSignalInput) {
  const payload = {
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    signal_type: input.signalType,
    category: input.category,
    source: input.source,
    rule_key: input.ruleKey ?? null,
    severity: input.severity ?? 2,
    score_delta: input.scoreDelta ?? 10,
    confidence: input.confidence ?? 1,
    evidence: input.evidence ?? {},
    dedupe_key: input.dedupeKey ?? null,
    related_subject_type: input.relatedSubjectType ?? null,
    related_subject_id: input.relatedSubjectId ?? null,
    expires_at: input.expiresAt ?? null,
  };

  const { data, error } = await supabaseAdmin.from("fraud_signals").insert(payload).select("id").single();
  if (error) {
    if (error.code === "23505" && input.dedupeKey) return { duplicate: true as const, id: null };
    throw error;
  }
  return { duplicate: false as const, id: data.id as string };
}

export async function linkFraudIdentity(input: {
  identityType: "email_hash" | "phone_hash" | "device_hash" | "ip_hash" | "payment_fingerprint" | "bank_fingerprint" | "domain_hash" | "other";
  rawValue?: string | null;
  identityHash?: string | null;
  subjectType: FraudSubjectType;
  subjectId: string;
  source: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}) {
  const identityHash = input.identityHash || (input.rawValue ? hashFraudIdentity(input.rawValue) : null);
  if (!identityHash) throw new Error("identityHash or rawValue is required");

  const { error } = await supabaseAdmin.from("fraud_identity_links").upsert({
    identity_type: input.identityType,
    identity_hash: identityHash,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    source: input.source,
    confidence: input.confidence ?? 1,
    metadata: input.metadata ?? {},
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "identity_type,identity_hash,subject_type,subject_id" });
  if (error) throw error;

  const { data: peers, error: peerError } = await supabaseAdmin
    .from("fraud_identity_links")
    .select("subject_type,subject_id")
    .eq("identity_type", input.identityType)
    .eq("identity_hash", identityHash);
  if (peerError) throw peerError;

  const uniquePeers = new Set((peers || []).map((peer) => `${peer.subject_type}:${peer.subject_id}`));
  if (uniquePeers.size >= 3) {
    await recordFraudSignal({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      signalType: "identity_reuse",
      category: "identity",
      source: input.source,
      ruleKey: input.subjectType === "user" ? "user_identity_reuse" : "linked_bad_actor",
      severity: 4,
      scoreDelta: Math.min(55, 20 + uniquePeers.size * 5),
      evidence: { identity_type: input.identityType, linked_subject_count: uniquePeers.size },
      dedupeKey: `identity-reuse:${input.identityType}:${identityHash}:${input.subjectType}:${input.subjectId}`,
    });
  }
}

export function hashFraudIdentity(value: string) {
  const pepper = process.env.FRAUD_IDENTITY_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pepper) throw new Error("Fraud identity hashing is not configured.");
  return createHash("sha256").update(`${pepper}:${value.trim().toLowerCase()}`).digest("hex");
}

export async function reportFraud(input: {
  reporterUserId?: string | null;
  reporterEmail?: string | null;
  reporterFingerprint?: string | null;
  subjectType: FraudSubjectType;
  subjectId: string;
  reason: string;
  details?: string | null;
  evidence?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin.from("fraud_reports").insert({
    reporter_user_id: input.reporterUserId ?? null,
    reporter_email: input.reporterEmail ?? null,
    reporter_fingerprint: input.reporterFingerprint ?? null,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    reason: input.reason,
    details: input.details ?? null,
    evidence: input.evidence ?? {},
  }).select("id").single();
  if (error) throw error;

  await recordFraudSignal({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    signalType: "user_report",
    category: "reports",
    source: "fraud_report",
    severity: 2,
    scoreDelta: 8,
    evidence: { report_id: data.id, reason: input.reason },
    dedupeKey: input.reporterFingerprint
      ? `report:${input.reporterFingerprint}:${input.subjectType}:${input.subjectId}:${new Date().toISOString().slice(0, 10)}`
      : null,
  });

  return data.id as string;
}

export async function getFraudDecision(subjectType: FraudSubjectType, subjectId: string): Promise<FraudDecision> {
  const now = Date.now();
  const [{ data: subject, error: subjectError }, { data: cases, error: caseError }, { data: actions, error: actionError }] = await Promise.all([
    supabaseAdmin
      .from("fraud_subjects")
      .select("risk_score,risk_band,enforcement_state,active_case_id")
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .maybeSingle(),
    supabaseAdmin
      .from("fraud_cases")
      .select("id,status,risk_score,opened_at")
      .eq("primary_subject_type", subjectType)
      .eq("primary_subject_id", subjectId)
      .order("opened_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("fraud_actions")
      .select("action_type,ends_at,created_at")
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (subjectError) throw subjectError;
  if (caseError) throw caseError;
  if (actionError) throw actionError;

  const riskScore = Math.max(0, Math.min(100, Number(subject?.risk_score || 0)));
  const riskBand = String(subject?.risk_band || "low");
  const enforcementState = String(subject?.enforcement_state || "none");
  const activeCase = (cases || []).find((item) => OPEN_CASE_STATUSES.has(String(item.status || ""))) || null;

  let actionType: string | null = null;
  let actionDecision: FraudDecisionLevel | null = null;
  for (const action of actions || []) {
    const type = String(action.action_type || "");
    if (type === "clear" || type === "restore") {
      actionType = type;
      actionDecision = "allow";
      break;
    }
    const endsAt = action.ends_at ? new Date(action.ends_at).getTime() : null;
    if (endsAt !== null && Number.isFinite(endsAt) && endsAt <= now) continue;
    if (ACTION_DECISIONS[type]) {
      actionType = type;
      actionDecision = ACTION_DECISIONS[type];
      break;
    }
  }

  let decision: FraudDecisionLevel = "allow";
  let reasonCode = "no_active_risk";
  if (actionDecision) {
    decision = actionDecision;
    reasonCode = `enforcement_${actionType}`;
  } else if (enforcementState === "banned") {
    decision = "block";
    reasonCode = "subject_banned";
  } else if (enforcementState === "suspended") {
    decision = "hold";
    reasonCode = "subject_suspended";
  } else if (enforcementState === "limited") {
    decision = "step_up_verification";
    reasonCode = "subject_limited";
  } else if (riskScore >= 85) {
    decision = "hold";
    reasonCode = "critical_risk";
  } else if (riskScore >= 65) {
    decision = "manual_review";
    reasonCode = "high_risk";
  } else if (activeCase && riskScore >= 40) {
    decision = "manual_review";
    reasonCode = "active_fraud_case";
  } else if (riskScore >= 40) {
    decision = "monitor";
    reasonCode = "elevated_risk";
  } else if (riskScore >= 20) {
    decision = "monitor";
    reasonCode = "guarded_risk";
  }

  return {
    subjectType,
    subjectId,
    decision,
    riskScore,
    riskBand,
    enforcementState,
    activeCaseId: activeCase?.id ? String(activeCase.id) : null,
    activeCaseStatus: activeCase?.status ? String(activeCase.status) : null,
    actionType,
    reasonCode,
  };
}

export function fraudDecisionPreventsSensitiveAction(decision: FraudDecision) {
  return ["step_up_verification", "manual_review", "hold", "block"].includes(decision.decision);
}

export async function getFraudSubject(subjectType: FraudSubjectType, subjectId: string) {
  const [{ data: subject, error: subjectError }, { data: signals, error: signalError }, { data: cases, error: caseError }, { data: actions, error: actionError }] = await Promise.all([
    supabaseAdmin.from("fraud_subjects").select("*").eq("subject_type", subjectType).eq("subject_id", subjectId).maybeSingle(),
    supabaseAdmin.from("fraud_signals").select("*").eq("subject_type", subjectType).eq("subject_id", subjectId).order("observed_at", { ascending: false }).limit(100),
    supabaseAdmin.from("fraud_cases").select("*").eq("primary_subject_type", subjectType).eq("primary_subject_id", subjectId).order("opened_at", { ascending: false }).limit(20),
    supabaseAdmin.from("fraud_actions").select("*").eq("subject_type", subjectType).eq("subject_id", subjectId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (subjectError) throw subjectError;
  if (signalError) throw signalError;
  if (caseError) throw caseError;
  if (actionError) throw actionError;
  return { subject, signals: signals || [], cases: cases || [], actions: actions || [] };
}
