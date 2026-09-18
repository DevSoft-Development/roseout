export const CAREER_STAGE_LABELS: Record<string, string> = {
  submitted: "Submitted",
  portfolio_review: "Portfolio Review",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  interview_requested: "Interview Requested",
  interview_scheduled: "Interview Scheduled",
  interview_completed: "Interview Completed",
  content_test: "Content Test",
  offer_pending: "Offer Pending",
  offer_sent: "Offer Sent",
  hired: "Hired",
  not_selected: "No Longer Moving Forward",
  withdrawn: "Withdrawn",
  talent_pool: "Talent Pool",
};

export const CAREER_TONE_BY_STAGE: Record<string, "rose" | "green" | "amber" | "red" | "blue" | "muted"> = {
  submitted: "blue",
  portfolio_review: "amber",
  under_review: "amber",
  shortlisted: "rose",
  interview_requested: "rose",
  interview_scheduled: "rose",
  interview_completed: "blue",
  content_test: "amber",
  offer_pending: "green",
  offer_sent: "green",
  hired: "green",
  not_selected: "muted",
  withdrawn: "muted",
  talent_pool: "blue",
};

export const JOB_STATUS_TONES: Record<string, "rose" | "green" | "amber" | "red" | "blue" | "muted"> = {
  draft: "muted",
  open: "green",
  paused: "amber",
  closed: "red",
  filled: "blue",
  archived: "muted",
};

export function formatCareerDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCareerStage(stage?: string | null) {
  return CAREER_STAGE_LABELS[String(stage || "")] || "Under Review";
}

export function getCareerStageTone(stage?: string | null) {
  return CAREER_TONE_BY_STAGE[String(stage || "")] || "muted";
}

export function getJobStatusTone(status?: string | null) {
  return JOB_STATUS_TONES[String(status || "")] || "muted";
}

export function getCompensationLabel(job: {
  compensation_text?: string | null;
  compensation_min?: number | null;
  compensation_max?: number | null;
  compensation_type?: string | null;
  internship_type?: string | null;
  is_paid?: boolean | null;
}) {
  if (job.compensation_text) return job.compensation_text;
  if (job.compensation_min || job.compensation_max) {
    const range = [job.compensation_min, job.compensation_max]
      .filter((value) => value != null)
      .map((value) => `$${value}`)
      .join("–");
    return range + (job.compensation_type ? ` ${job.compensation_type}` : "");
  }
  if (job.internship_type === "unpaid_educational" || job.internship_type === "college_credit") {
    return "Educational / College Credit";
  }
  return job.is_paid === false ? "Educational experience" : "Compensation shared during hiring";
}
