import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const SCORE_FIELDS = [
  "communication_score",
  "experience_score",
  "role_fit_score",
  "availability_score",
  "professionalism_score",
  "market_knowledge_score",
] as const;
const SCORECARD_FIELDS = "id,application_id,reviewer_id,communication_score,experience_score,role_fit_score,availability_score,professionalism_score,market_knowledge_score,overall_score,recommendation,notes,created_at,updated_at" as const;
const RECOMMENDATIONS = new Set(["strong_yes", "yes", "hold", "no"]);

function score(value: unknown, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw new Error("Every structured score must be an integer from 1 to 5.");
  return parsed;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const recommendation = typeof body.recommendation === "string" ? body.recommendation : "";
    if (!RECOMMENDATIONS.has(recommendation)) return NextResponse.json({ error: "Choose a structured recommendation." }, { status: 400 });

    const scored = {
      communication_score: score(body.communication_score),
      experience_score: score(body.experience_score),
      role_fit_score: score(body.role_fit_score),
      availability_score: score(body.availability_score),
      professionalism_score: score(body.professionalism_score),
      market_knowledge_score: score(body.market_knowledge_score, false),
    };
    const requiredScores = SCORE_FIELDS.slice(0, 5).map((field) => Number(scored[field]));
    const overallScore = Math.round(requiredScores.reduce((total, value) => total + value, 0) / requiredScores.length);
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 3000) : "";
    const complianceError = validateNewYorkHiringText(notes);
    if (complianceError) return NextResponse.json({ error: complianceError.message, compliance: "new_york", code: complianceError.key }, { status: 400 });

    const { data, error } = await getAdminDatabaseClient()
      .from("career_application_scorecards")
      .insert({ application_id: id, reviewer_id: admin.user_id, ...scored, overall_score: overallScore, recommendation, notes: notes || null })
      .select(SCORECARD_FIELDS)
      .single();
    if (error) throw new Error(error.message);

    const { error: applicationError } = await getAdminDatabaseClient().from("career_applications").update({ score: overallScore, updated_at: new Date().toISOString() }).eq("id", id);
    if (applicationError) throw new Error(applicationError.message);
    return NextResponse.json({ scorecard: data });
  } catch (error) {
    console.error("career scorecard failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not save this scorecard." }, { status: 400 });
  }
}
