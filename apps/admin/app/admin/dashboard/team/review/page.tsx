import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { TeamReviewList } from "@/components/TeamReviewList";

export const dynamic = "force-dynamic";

export default async function Review() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const adminDb = getAdminDatabaseClient();

  const [
    { data: sessions = [] },
    { data: changes = [] },
    { data: proofs = [] },
    { data: visits = [] },
    { data: social = [] },
  ] = await Promise.all([
    adminDb
      .from("team_work_sessions")
      .select("id,work_type,status,approval_status,user_notes,created_at")
      .eq("approval_status", "pending_review")
      .limit(50),
    adminDb
      .from("location_change_requests")
      .select("*")
      .eq("status", "pending_review")
      .limit(50),
    adminDb
      .from("team_proofs")
      .select("*")
      .eq("manager_review_status", "pending_review")
      .limit(50),
    adminDb
      .from("ambassador_site_visits")
      .select("*")
      .eq("manager_review_status", "pending_review")
      .limit(50),
    adminDb
      .from("ambassador_social_outreach")
      .select("*")
      .eq("manager_review_status", "pending_review")
      .limit(50),
  ]);

  const rows = [
    ...(sessions || []).map((row) => ({
      ...row,
      title: `Work session: ${row.work_type}`,
      status: row.approval_status,
      table: "team_work_sessions",
    })),
    ...(changes || []).map((row) => ({
      ...row,
      table: "location_change_requests",
    })),
    ...(proofs || []).map((row) => ({
      ...row,
      table: "team_proofs",
    })),
    ...(visits || []).map((row) => ({
      ...row,
      table: "ambassador_site_visits",
    })),
    ...(social || []).map((row) => ({
      ...row,
      table: "ambassador_social_outreach",
    })),
  ];

  return (
    <TeamReviewList
      title="Manager Review"
      description="Unified review queue for sessions, site visits, social proof, protected field changes, and proof uploads. Work sessions use their dedicated Work Sessions review buttons."
      rows={rows}
      table="location_change_requests"
    />
  );
}
