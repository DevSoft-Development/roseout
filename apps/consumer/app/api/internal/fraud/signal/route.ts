import { NextRequest, NextResponse } from "next/server";
import { recordFraudSignal, type FraudSubjectType } from "@/lib/fraud";

export const runtime = "nodejs";

const SUBJECT_TYPES = new Set<FraudSubjectType>([
  "user", "location", "claim", "organizer", "event", "experience", "reservation", "order", "payment", "payout", "review", "other",
]);

function authorized(request: NextRequest) {
  const secret = process.env.FRAUD_INGEST_SECRET || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const subjectType = String(body?.subjectType || "") as FraudSubjectType;
    const subjectId = String(body?.subjectId || "").trim();
    const signalType = String(body?.signalType || "").trim();
    const category = String(body?.category || "").trim();
    const source = String(body?.source || "internal").trim();
    if (!SUBJECT_TYPES.has(subjectType) || !subjectId || !signalType || !category) {
      return NextResponse.json({ error: "Invalid signal" }, { status: 400 });
    }

    const result = await recordFraudSignal({
      subjectType,
      subjectId,
      signalType,
      category,
      source,
      ruleKey: body?.ruleKey ? String(body.ruleKey) : null,
      severity: Number.isFinite(Number(body?.severity)) ? Math.max(1, Math.min(5, Number(body.severity))) : 2,
      scoreDelta: Number.isFinite(Number(body?.scoreDelta)) ? Math.max(-100, Math.min(100, Number(body.scoreDelta))) : 10,
      confidence: Number.isFinite(Number(body?.confidence)) ? Math.max(0, Math.min(1, Number(body.confidence))) : 1,
      evidence: body?.evidence && typeof body.evidence === "object" ? body.evidence : {},
      dedupeKey: body?.dedupeKey ? String(body.dedupeKey) : null,
      relatedSubjectType: SUBJECT_TYPES.has(String(body?.relatedSubjectType) as FraudSubjectType) ? body.relatedSubjectType : null,
      relatedSubjectId: body?.relatedSubjectId ? String(body.relatedSubjectId) : null,
      expiresAt: body?.expiresAt ? String(body.expiresAt) : null,
    });

    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fraud_signal_failed";
    console.error("fraud signal ingestion failed", { error: message });
    return NextResponse.json({ error: "Unable to record signal" }, { status: 500 });
  }
}
