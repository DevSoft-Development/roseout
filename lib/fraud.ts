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
  const pepper = process.env.FRAUD_IDENTITY_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "theouthaven-fraud";
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
