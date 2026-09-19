import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { hashFraudIdentity, reportFraud, type FraudSubjectType } from "@/lib/fraud";

const SUBJECT_TYPES = new Set<FraudSubjectType>([
  "user", "location", "claim", "organizer", "event", "experience", "reservation", "order", "payment", "payout", "review", "other",
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subjectType = String(body?.subjectType || "") as FraudSubjectType;
    const subjectId = String(body?.subjectId || "").trim();
    const reason = String(body?.reason || "").trim();
    const details = String(body?.details || "").trim();

    if (!SUBJECT_TYPES.has(subjectType) || !subjectId || reason.length < 3 || reason.length > 160 || details.length > 4000) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const reporterFingerprint = hashFraudIdentity(`${user?.id || "guest"}:${ip}:${userAgent}`);

    const id = await reportFraud({
      reporterUserId: user?.id || null,
      reporterEmail: user?.email || null,
      reporterFingerprint,
      subjectType,
      subjectId,
      reason,
      details: details || null,
      evidence: { source_path: request.headers.get("referer") || null },
    });

    return NextResponse.json({ ok: true, reportId: id }, { status: 201 });
  } catch (error) {
    console.error("fraud report failed", error);
    return NextResponse.json({ error: "Unable to submit report" }, { status: 500 });
  }
}
