type JobLike = Record<string, unknown>;

type TextCheck = {
  key: string;
  pattern: RegExp;
  message: string;
};

export const NEW_YORK_STATE_PROTECTED_CLASSES = [
  "age",
  "race",
  "creed",
  "color",
  "national origin",
  "citizenship or immigration status",
  "sexual orientation",
  "gender identity or expression",
  "military status",
  "sex",
  "disability",
  "predisposing genetic characteristics",
  "familial status",
  "marital status",
  "status as a victim of domestic violence",
] as const;

export const NYC_ADDITIONAL_HIRING_PROTECTIONS = [
  "caregiver status",
  "partnership status",
  "pregnancy",
  "sexual and reproductive health decisions",
  "unemployment status",
  "height",
  "weight",
  "status as a victim of domestic violence, sexual violence, or stalking",
  "lawful arrest / conviction protections",
  "credit-history protections",
] as const;

const salaryHistoryChecks: TextCheck[] = [
  { key: "salary_history", pattern: /\bsalary history\b/i, message: "Do not ask for, record, or rely on salary history in New York hiring records." },
  { key: "current_salary", pattern: /\b(current|present|previous|prior|last)\s+(salary|wage|pay|earnings|compensation|benefits)\b/i, message: "Do not record an applicant's current or prior compensation. Use the posted range and job-related qualifications instead." },
  { key: "earned_before", pattern: /\bhow much (did|do) (you|they) (make|earn)\b/i, message: "New York hiring records cannot be used to solicit salary history." },
];

const protectedTraitChecks: TextCheck[] = [
  { key: "protected_trait", pattern: /\b(race|ethnicity|religion|creed|pregnan(?:t|cy)|marital status|sexual orientation|gender identity|gender expression|genetic characteristic|domestic violence victim|caregiver status|unemployment status)\b/i, message: "Keep hiring decisions and notes limited to job-related qualifications. Protected characteristics must not be used as selection criteria." },
  { key: "medical", pattern: /\b(disability|disabled|medical condition|diagnosis|medication|mental health|physical condition)\b/i, message: "Medical/disability and accommodation information must stay out of selection scoring and general interview notes. Route accommodation matters separately." },
  { key: "family", pattern: /\b(children|childcare|family plans|planning a family|maternity|paternity)\b/i, message: "Family, pregnancy, and caregiver information must not be used in New York hiring decisions." },
  { key: "citizenship", pattern: /\b(citizenship status|immigration status|green card|visa status|country of origin)\b/i, message: "Do not use citizenship, immigration status, or national origin as a hiring criterion. Employment-authorization verification belongs in the authorized onboarding process." },
  { key: "body", pattern: /\b(height|weight|body size)\b/i, message: "For NYC applicants, height and weight are protected characteristics and must not be used in hiring decisions except where a lawful exception applies." },
];

const criminalHistoryChecks: TextCheck[] = [
  { key: "criminal_history", pattern: /\b(criminal history|criminal record|conviction|convicted|felon|felony|misdemeanor|arrest record|arrested|pending criminal case|background check)\b/i, message: "Keep criminal-history information out of this hiring workflow. For NYC roles, criminal history cannot be sought or considered before a conditional offer and any later review must use the separate Fair Chance process." },
];

const creditHistoryChecks: TextCheck[] = [
  { key: "credit_history", pattern: /\b(credit history|credit score|credit report|consumer credit)\b/i, message: "Do not use consumer credit history in the standard NYC hiring workflow unless a documented legal exemption has been reviewed." },
];

const jobAdCriminalChecks: TextCheck[] = [
  { key: "background_required", pattern: /\b(background check required|must pass (a )?background check)\b/i, message: "NYC Fair Chance rules prohibit pre-offer job advertisements from saying a background check is required unless a specific exemption applies." },
  { key: "clean_record", pattern: /\b(clean record|clean criminal record|no felons?|no felonies|no criminal record)\b/i, message: "Remove criminal-history limitations from the job posting. NYC Fair Chance rules generally prohibit them before a conditional offer." },
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstMatch(value: string, checks: TextCheck[]) {
  for (const check of checks) if (check.pattern.test(value)) return check;
  return null;
}

export function validateNewYorkHiringText(value: unknown) {
  const content = text(value);
  if (!content) return null;
  return firstMatch(content, [
    ...salaryHistoryChecks,
    ...protectedTraitChecks,
    ...criminalHistoryChecks,
    ...creditHistoryChecks,
  ]);
}

export function validateNewYorkJobPosting(job: JobLike) {
  const status = text(job.status).toLowerCase();
  if (status !== "open") return null;

  const postingText = [
    job.title,
    job.summary,
    job.overview,
    job.responsibilities,
    job.requirements,
    job.nice_to_have,
    job.benefits,
    job.schedule,
    job.hiring_process,
    job.compensation_text,
  ].map(text).filter(Boolean).join("\n");

  const salaryHistory = firstMatch(postingText, salaryHistoryChecks);
  if (salaryHistory) return salaryHistory;
  const criminalAd = firstMatch(postingText, jobAdCriminalChecks);
  if (criminalAd) return criminalAd;

  const description = text(job.overview) || text(job.summary) || text(job.responsibilities) || text(job.requirements);
  if (!description) {
    return { key: "job_description", message: "Add a meaningful job description before opening this New York role." };
  }

  const compensationType = text(job.compensation_type).toLowerCase();
  const compensationText = text(job.compensation_text);
  const isPaid = job.is_paid !== false && compensationType !== "unpaid";

  if (!isPaid) {
    if (compensationType !== "unpaid" && !/\bunpaid\b/i.test(compensationText) && !/college credit|educational/i.test(compensationText)) {
      return { key: "unpaid_disclosure", message: "Clearly disclose that an unpaid New York opportunity is unpaid/educational before opening the posting." };
    }
    return null;
  }

  if (compensationType === "commission") {
    if (!/commission/i.test(compensationText)) {
      return { key: "commission_disclosure", message: "New York pay-transparency rules require a commission-only role to clearly state that compensation is commission based." };
    }
    return null;
  }

  const minimum = numberOrNull(job.compensation_min);
  const maximum = numberOrNull(job.compensation_max);
  if (minimum === null || maximum === null) {
    return { key: "pay_range", message: "Add a good-faith minimum and maximum salary or hourly rate before opening this New York paid role." };
  }
  if (minimum < 0 || maximum < 0 || maximum < minimum) {
    return { key: "pay_range_invalid", message: "The New York compensation range is invalid. Maximum compensation must be greater than or equal to minimum compensation." };
  }
  if (!compensationType || !["salary", "hourly", "stipend"].includes(compensationType)) {
    return { key: "pay_type", message: "Choose salary, hourly, stipend, commission, or unpaid so the New York compensation disclosure is clear." };
  }

  return null;
}

export function isNewYorkPublicPostingCompliant(job: JobLike) {
  return validateNewYorkJobPosting(job) === null;
}

export const NEW_YORK_APPLICANT_NOTICE =
  "TheOutHaven is an equal opportunity employer. New York applicants are considered without regard to age, race, creed, color, national origin, citizenship or immigration status, sexual orientation, gender identity or expression, military status, sex, disability, predisposing genetic characteristics, familial status, marital status, domestic-violence victim status, or any other status protected by law. New York City applicants also receive the additional protections of the NYC Human Rights Law, including caregiver and partnership status, pregnancy, sexual and reproductive health decisions, unemployment status, height and weight, protections for victims of domestic violence/sexual violence/stalking, salary-history and credit-history protections, and Fair Chance protections. We do not ask for salary history or pre-offer criminal history. Reasonable accommodations are handled separately from candidate evaluation.";
