import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminActionButton,
  AdminDetailPanel,
  AdminDetailSection,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  calculateApplicantDisplayName,
  formatCareerDate,
  formatCareerStage,
  getCareerStageTone,
  getNextRecommendedAction,
} from "@/lib/careers/format";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CareerJobSummary = {
  title: string | null;
  department: string | null;
  slug: string | null;
  is_internship: boolean | null;
  internship_type: string | null;
};

type CareerApplicationDetail = {
  id: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  website_url: string | null;
  social_handle: string | null;
  source: string | null;
  submitted_at: string | null;
  stage: string;
  score: number | null;
  cover_letter: string | null;
  career_job: CareerJobSummary | null;
  [key: string]: unknown;
};

type ApplicationDetailProps = {
  params: Promise<{ id: string }>;
};

export default async function ApplicationDetail({
  params,
}: ApplicationDetailProps) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);

  const { id } = await params;

  const [
    applicationResult,
    answersResult,
    notesResult,
    historyResult,
    interviewsResult,
    offersResult,
    testsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("career_applications")
      .select(
        `
          *,
          career_job:career_jobs(
            title,
            department,
            slug,
            is_internship,
            internship_type
          )
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("career_application_answers")
      .select("*")
      .eq("application_id", id),
    supabaseAdmin
      .from("career_application_notes")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("career_application_stage_history")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("career_interviews")
      .select("*")
      .eq("application_id", id),
    supabaseAdmin
      .from("career_offers")
      .select("*")
      .eq("application_id", id),
    supabaseAdmin
      .from("career_content_tests")
      .select("*")
      .eq("application_id", id),
  ]);

  if (applicationResult.error) {
    console.error("Failed to load career application", {
      applicationId: id,
      error: applicationResult.error.message,
    });
    notFound();
  }

  const app =
    applicationResult.data as CareerApplicationDetail | null;

  if (!app) {
    notFound();
  }

  const answers = answersResult.data ?? [];
  const notes = notesResult.data ?? [];
  const history = historyResult.data ?? [];
  const interviews = interviewsResult.data ?? [];

  void offersResult;
  void testsResult;

  const name = calculateApplicantDisplayName(app as any);
  const jobTitle = app.career_job?.title ?? "Career application";

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Applicant CRM Profile"
        title={name}
        subtitle={`${jobTitle} · Applied ${formatCareerDate(
          app.submitted_at,
        )} · ${getNextRecommendedAction(app.stage)}`}
        badge={
          <AdminStatusBadge tone={getCareerStageTone(app.stage)}>
            {formatCareerStage(app.stage)}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/careers/applications">
              Applications
            </AdminActionButton>
            <AdminActionButton
              href={`mailto:${app.email}`}
              variant="primary"
            >
              Email
            </AdminActionButton>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <AdminDetailPanel>
          <AdminDetailSection title="Profile">
            <div className="space-y-2 text-sm text-white/70">
              <p className="font-black text-white">{name}</p>
              <p>{app.email}</p>
              <p>{app.phone || "No phone"}</p>
              <p>
                {[app.city, app.state].filter(Boolean).join(", ") ||
                  "No location"}
              </p>

              {app.resume_url ? (
                String(app.resume_url).startsWith("resumes/") ? (
                  <p>
                    Resume: {" "}
                    <span className="text-white/60">Resume uploaded</span>
                  </p>
                ) : (
                  <p>
                    <Link
                      className="text-rose-200"
                      href={String(app.resume_url)}
                    >
                      View Resume
                    </Link>
                  </p>
                )
              ) : null}

              {[
                ["LinkedIn", app.linkedin_url],
                ["Portfolio", app.portfolio_url],
                ["Website", app.website_url],
              ].map(([label, url]) =>
                url ? (
                  <p key={String(label)}>
                    <Link
                      className="text-rose-200"
                      href={String(url)}
                    >
                      {label}
                    </Link>
                  </p>
                ) : null,
              )}

              <p>Social: {app.social_handle || "—"}</p>
              <p>Source: {app.source || "careers_page"}</p>
            </div>
          </AdminDetailSection>
        </AdminDetailPanel>

        <div className="space-y-4">
          {[
            "Overview",
            "Application Answers",
            "Marketing Fit",
            "Resume / Links",
            "Notes",
            "Scorecard",
            "Interviews",
            "Emails",
            "Timeline",
            "Files",
          ].map((tab) => (
            <AdminSectionCard key={tab} className="p-5">
              <h2 className="text-xl font-black">{tab}</h2>

              {tab === "Application Answers" ? (
                <div className="mt-3 grid gap-3">
                  {answers.map((answer: any) => (
                    <div
                      className="rounded-2xl border border-white/10 bg-black/20 p-3"
                      key={answer.id}
                    >
                      <p className="text-xs font-black text-white/45">
                        {answer.question_label}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-white/75">
                        {answer.answer_text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === "Marketing Fit" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    "Strong Social Fit",
                    "Good On Camera",
                    "Good Writer",
                    "Good Editor",
                    "Campus Fit",
                    "Creator Fit",
                    "Influencer Outreach Fit",
                    "Paid Track",
                    "College Credit Track",
                    "Needs Portfolio Review",
                  ].map((tag) => (
                    <span
                      className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100"
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {tab === "Notes" ? (
                <div className="mt-3 grid gap-2">
                  {notes.map((note: any) => (
                    <p
                      className="rounded-xl bg-black/20 p-3 text-sm text-white/70"
                      key={note.id}
                    >
                      {note.note}
                    </p>
                  ))}
                </div>
              ) : null}

              {tab === "Interviews" ? (
                <p className="mt-2 text-sm text-white/60">
                  {interviews.length} interview records
                </p>
              ) : null}

              {tab === "Timeline" ? (
                <div className="mt-3 grid gap-2">
                  {history.map((entry: any) => (
                    <p
                      className="text-sm text-white/60"
                      key={entry.id}
                    >
                      {formatCareerDate(entry.created_at)} · {" "}
                      {formatCareerStage(entry.from_stage)} → {" "}
                      {formatCareerStage(entry.to_stage)}
                    </p>
                  ))}
                </div>
              ) : null}

              {tab === "Scorecard" ? (
                <p className="mt-2 text-sm text-white/60">
                  Score: {app.score ?? "Not scored"}
                </p>
              ) : null}

              {tab === "Emails" ? (
                <p className="mt-2 text-sm text-white/60">
                  Email event tracking is enabled through
                  career_email_events.
                </p>
              ) : null}

              {tab === "Files" ? (
                <p className="mt-2 text-sm text-white/60">
                  Uploaded resumes are stored privately. Resume links and
                  portfolio links remain available when applicants provide
                  them.
                </p>
              ) : null}

              {tab === "Overview" ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/65">
                  {app.cover_letter || "No cover letter provided."}
                </p>
              ) : null}
            </AdminSectionCard>
          ))}
        </div>
      </div>
    </AdminPageShell>
  );
}
