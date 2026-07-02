import OpenAI from "openai";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const DEFAULT_MODEL = "gpt-4o-mini";
const DRAFT_KEYS = ["summary", "overview", "responsibilities", "requirements", "nice_to_have", "benefits", "schedule", "hiring_process"] as const;
type DraftKey = (typeof DRAFT_KEYS)[number];
type CareerJobDraft = Record<DraftKey, string>;
type CareerJobDraftInput = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function bool(value: unknown) {
  return value === true || value === "true";
}

function numberText(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(text(value));
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function shortText(value: unknown, max = 220) {
  return text(value).slice(0, max);
}

function label(value: unknown, fallback = "role") {
  const raw = text(value);
  return raw ? raw.replace(/_/g, " ") : fallback;
}

function getCareersAiModel() {
  const model = process.env.CAREERS_AI_MODEL || DEFAULT_MODEL;
  const normalized = model.toLowerCase();
  if (normalized.includes("gpt-5") || normalized === "gpt-4" || normalized.startsWith("gpt-4-")) return DEFAULT_MODEL;
  return model;
}

function safeDraft(value: unknown): CareerJobDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const draft = Object.fromEntries(DRAFT_KEYS.map((key) => [key, text(record[key])])) as CareerJobDraft;
  if (!draft.summary || !draft.overview || !draft.responsibilities || !draft.requirements) return null;
  return draft;
}

function parseDraft(content: string) {
  try {
    return safeDraft(JSON.parse(content));
  } catch {
    return null;
  }
}

export function buildFallbackCareerJobDraft(input: CareerJobDraftInput): CareerJobDraft {
  const title = label(input.title, "Team Member");
  const department = label(input.department, "the team");
  const subdepartment = text(input.subdepartment);
  const location = text(input.location) || "Remote / flexible";
  const workplace = label(input.workplace_type, "flexible");
  const employment = label(input.employment_type, bool(input.is_internship) ? "internship" : "role");
  const compensation = text(input.compensation_text) || (bool(input.is_paid) ? "Compensation details shared during the process." : "Unpaid educational opportunity where permitted.");
  const minHours = numberText(input.weekly_hours_min);
  const maxHours = numberText(input.weekly_hours_max);
  const duration = numberText(input.program_duration_weeks);
  const hours = minHours && maxHours ? `${minHours}-${maxHours} hours/week` : minHours ? `${minHours}+ hours/week` : maxHours ? `Up to ${maxHours} hours/week` : "Schedule discussed during the process";
  const internshipNote = bool(input.is_internship) ? ` This ${label(input.internship_type, "internship")} is designed to provide practical learning and portfolio-building experience.` : "";
  const creditNote = bool(input.supports_college_credit) ? " College credit support may be available when coordinated with the candidate's school." : "";

  return {
    summary: `Join TheOutHaven as a ${title} supporting ${department}${subdepartment ? ` / ${subdepartment}` : ""}.`,
    overview: `The ${title} is a ${workplace} ${employment} based in ${location}. This role helps TheOutHaven move quickly while maintaining a thoughtful candidate, partner, and customer experience.${internshipNote}${creditNote}`,
    responsibilities: `- Support day-to-day priorities for ${department}
- Communicate clearly with teammates and stakeholders
- Organize work, document updates, and follow through on assigned tasks
- Help improve processes, content, operations, or customer experiences as needed`,
    requirements: `- Strong written communication and attention to detail
- Reliable follow-through and comfort working independently
- Interest in TheOutHaven's mission and community-focused work
- Ability to manage priorities in a fast-moving environment`,
    nice_to_have: `- Prior experience related to ${department}
- Familiarity with startups, hospitality, marketplaces, or local business operations
- Portfolio, coursework, or examples of relevant projects
- Comfort learning new tools and workflows`,
    benefits: `- ${compensation}
- Practical experience with a growing consumer and local-business platform
- Collaborative team environment with clear expectations
- Opportunity to build meaningful work samples and learn from feedback`,
    schedule: duration ? `${hours} for approximately ${duration} weeks. Final schedule is confirmed with the selected candidate.` : `${hours}. Final schedule is confirmed with the selected candidate.`,
    hiring_process: "1. Apply online\n2. Application review\n3. Intro call\n4. Final review",
  };
}

function buildPrompt(input: CareerJobDraftInput) {
  const compact = {
    title: shortText(input.title, 120), department: shortText(input.department, 80), subdepartment: shortText(input.subdepartment, 80), location: shortText(input.location, 120), workplace_type: shortText(input.workplace_type, 40), employment_type: shortText(input.employment_type, 40), compensation_text: shortText(input.compensation_text, 160), internship_type: shortText(input.internship_type, 60), is_internship: bool(input.is_internship), is_paid: bool(input.is_paid), supports_college_credit: bool(input.supports_college_credit), weekly_hours_min: numberText(input.weekly_hours_min), weekly_hours_max: numberText(input.weekly_hours_max), program_duration_weeks: numberText(input.program_duration_weeks), existing: safeDraft(input.existing),
  };
  return `Create concise job posting draft JSON only. No markdown. No extra keys. Keep bullets short. Avoid legal claims and long company background.\nSchema:{"summary":"...","overview":"...","responsibilities":"- ...\\n- ...","requirements":"- ...\\n- ...","nice_to_have":"- ...\\n- ...","benefits":"- ...\\n- ...","schedule":"...","hiring_process":"1. Apply online\\n2. Application review\\n3. Intro call\\n4. Final review"}\nInput:${JSON.stringify(compact)}`;
}

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.careersEdit);
  if (error) return error;

  const input = await request.json().catch(() => ({}));
  const model = getCareersAiModel();
  const fallback = buildFallbackCareerJobDraft(input);

  if (!process.env.OPENAI_API_KEY) return Response.json({ source: "fallback", model, draft: fallback });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Return valid JSON only for a concise job posting draft. Do not include chain-of-thought." },
        { role: "user", content: buildPrompt(input) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
      temperature: 0.4,
    });
    const draft = parseDraft(completion.choices[0]?.message.content || "");
    if (!draft) return Response.json({ source: "fallback", model, draft: fallback });
    return Response.json({ source: "ai", model, draft });
  } catch {
    return Response.json({ source: "fallback", model, draft: fallback });
  }
}
