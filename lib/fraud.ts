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

const FRAUD_DECISIONS = new Set<FraudDecisionLevel>([
  "allow",
  "monitor",
  "step_up_verification",
  "manual_review",
  "hold",
  "block",
]);

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

  if (input.subjectType !== "user" && input.subjectType !== "claim") return;

  const { data: peers, error: peerError } = await supabaseAdmin
    .from("fraud_identity_links")
    .select("subject_type,subject_id")
    .eq("identity_type", input.identityType)
    .eq("identity_hash", identityHash)
    .eq("subject_type", input.subjectType);
  if (peerError) throw peerError;

  const uniquePeers = new Set((peers || []).map((peer) => String(peer.subject_id)));
  const threshold = input.subjectType === "user"
    ? input.identityType === "email_hash" || input.identityType === "phone_hash"
      ? 2
      : input.identityType === "device_hash" || input.identityType === "payment_fingerprint"
        ? 3
        : input.identityType === "ip_hash"
          ? 8
          : 4
    : 5;
  if (uniquePeers.size < threshold) return;

  const ipOnly = input.identityType === "ip_hash";
  await recordFraudSignal({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    signalType: input.subjectType === "claim" ? "claim_identity_reuse" : "identity_reuse",
    category: input.subjectType === "claim" ? "account_takeover" : "identity",
    source: input.source,
    ruleKey: input.subjectType === "user" ? "user_identity_reuse" : "claim_takeover_attempt",
    severity: ipOnly ? 3 : 4,
    scoreDelta: ipOnly ? 25 : Math.min(55, 20 + uniquePeers.size * 5),
    confidence: input.subjectType === "claim" ? 0.85 : 1,
    evidence: { identity_type: input.identityType, linked_subject_count: uniquePeers.size },
    dedupeKey: `identity-reuse:${input.identityType}:${identityHash}:${input.subjectType}:${input.subjectId}`,
  });
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
  const { data, error } = await supabaseAdmin.rpc("fraud_decide_subject", {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
  });
  if (error) throw error;

  const raw = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const rawDecision = String(raw.decision || "allow") as FraudDecisionLevel;
  const decision = FRAUD_DECISIONS.has(rawDecision) ? rawDecision : "allow";

  return {
    subjectType,
    subjectId,
    decision,
    riskScore: Math.max(0, Math.min(100, Number(raw.riskScore || 0))),
    riskBand: String(raw.riskBand || "low"),
    enforcementState: String(raw.enforcementState || "none"),
    activeCaseId: raw.activeCaseId ? String(raw.activeCaseId) : null,
    activeCaseStatus: raw.activeCaseStatus ? String(raw.activeCaseStatus) : null,
    actionType: raw.actionType ? String(raw.actionType) : null,
    reasonCode: String(raw.reasonCode || "no_active_risk"),
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
