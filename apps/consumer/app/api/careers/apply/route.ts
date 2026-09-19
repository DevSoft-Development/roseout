import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { normalizeCareerEmail } from "@/lib/careers/actions";

const MAX_FIELD_LENGTH = 4000;
const SHORT_FIELD_LENGTH = 320;
const URL_FIELDS = ["resumeUrl", "resume_url", "resumeStoragePath", "resume_storage_path", "portfolioUrl", "portfolio_url", "linkedinUrl", "linkedin_url", "websiteUrl", "website_url", "marketingPortfolioUrl"];
const STORAGE_PATH_PATTERN = /^resumes\/\d{4}\/\d{2}\/[a-f0-9-]+-[a-zA-Z0-9._-]+$/;

async function parse(req: Request) { const ct = req.headers.get("content-type") || ""; if (ct.includes("application/json")) return await req.json(); const form = await req.formData(); return Object.fromEntries(form.entries()); }
function text(value: unknown, max = SHORT_FIELD_LENGTH) { const clean = String(value || "").trim(); return clean ? clean.slice(0, max) : ""; }
function nullableText(value: unknown, max = SHORT_FIELD_LENGTH) { return text(value, max) || null; }
function validEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320; }
function isValidUrl(value: string) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && value.length <= 2048; } catch { return false; } }
function isValidResumeValue(value: string) { return !value || STORAGE_PATH_PATTERN.test(value) || isValidUrl(value); }
function requestIp(req: Request) { return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined; }

async function verifyTurnstile(req: Request, token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    console.warn("TURNSTILE_SECRET_KEY is not configured; allowing careers application in non-production.");
    return true;
  }
  if (!token) return false;
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  const ip = requestIp(req);
  if (ip) form.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    return Boolean(data.success);
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body: any = await parse(req);
    const jobId = text(body.jobId || body.job_id);
    const firstName = text(body.firstName || body.first_name, 120);
    const lastName = text(body.lastName || body.last_name, 120);
    const email = normalizeCareerEmail(String(body.email || ""));
    if (!jobId || !firstName || !lastName || !email || !validEmail(email)) return NextResponse.json({ error: "Please complete the required application fields." }, { status: 400 });
    for (const [key, value] of Object.entries(body)) if (String(value || "").length > MAX_FIELD_LENGTH && !key.startsWith("question_")) return NextResponse.json({ error: "One of your answers is too long. Please shorten it and try again." }, { status: 400 });
    for (const key of URL_FIELDS) {
      const value = text(body[key], 2048);
      const isResumeField = key.toLowerCase().includes("resume");
      if (value && (isResumeField ? !isValidResumeValue(value) : !isValidUrl(value))) return NextResponse.json({ error: "Please enter valid links that start with http:// or https://." }, { status: 400 });
    }

    const turnstileOk = await verifyTurnstile(req, text(body.turnstileToken, 4096));
    if (!turnstileOk) return NextResponse.json({ error: "Security check failed. Please try again." }, { status: 400 });

    const { data: job } = await supabaseAdmin.from("career_jobs").select("id,title,status,visibility").eq("id", jobId).maybeSingle();
    if (!job || job.status !== "open" || !["public", "private_link"].includes(job.visibility)) return NextResponse.json({ error: "This role is not accepting applications right now." }, { status: 400 });
    const existing = await supabaseAdmin.from("career_applications").select("id").eq("job_id", jobId).eq("email", email).maybeSingle();
    if (existing.data) return NextResponse.json({ error: "We already received an application for this role with that email." }, { status: 409 });

    const resumeUrl = text(body.resumeStoragePath || body.resume_storage_path || body.resumeUrl || body.resume_url, 2048);
    const resumeOriginalName = nullableText(body.resumeOriginalName || body.resume_original_name, 255);
    const resumeMimeType = nullableText(body.resumeMimeType || body.resume_mime_type, 255);
    const resumeSizeBytes = Number(body.resumeSizeBytes || body.resume_size_bytes || 0) || null;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: app, error } = await supabaseAdmin.from("career_applications").insert({ job_id: jobId, user_id: user?.id || null, first_name: firstName, last_name: lastName, email, phone: nullableText(body.phone, 80), city: nullableText(body.city, 120), state: nullableText(body.state, 80), linkedin_url: nullableText(body.linkedinUrl || body.linkedin_url, 2048), portfolio_url: nullableText(body.portfolioUrl || body.portfolio_url, 2048), website_url: nullableText(body.websiteUrl || body.website_url, 2048), social_handle: nullableText(body.socialHandle || body.social_handle, 120), resume_url: resumeUrl || null, cover_letter: nullableText(body.coverLetter || body.cover_letter, MAX_FIELD_LENGTH) }).select("id").single();
    if (error || !app) return NextResponse.json({ error: "We could not submit your application. Please try again." }, { status: 500 });

    const answers = Object.entries(body).filter(([k, v]) => k.startsWith("question_") && !k.startsWith("question_label_") && String(v || "").trim()).map(([k, v]) => ({ application_id: app.id, question_id: k.replace("question_", ""), question_label: String(body[`question_label_${k.replace("question_", "")}`] || "Application question").slice(0, 500), answer_text: String(v).trim().slice(0, MAX_FIELD_LENGTH) }));
    if (answers.length) await supabaseAdmin.from("career_application_answers").insert(answers);
    if (resumeUrl) {
      const { error: fileError } = await supabaseAdmin.from("career_application_files").insert({ application_id: app.id, file_type: "resume", file_url: resumeUrl, original_name: resumeOriginalName, mime_type: resumeMimeType, size_bytes: resumeSizeBytes });
      if (fileError) console.warn("Could not record career application file metadata", fileError.message);
    }
    if (body.marketingPortfolioUrl) await supabaseAdmin.from("career_marketing_portfolios").insert({ application_id: app.id, platform: "portfolio", url: text(body.marketingPortfolioUrl, 2048) });
    if (body.schoolName || body.programName || body.creditContactEmail) await supabaseAdmin.from("career_internship_school_credit").insert({ application_id: app.id, school_name: nullableText(body.schoolName, 255), program_name: nullableText(body.programName, 255), credit_contact_email: nullableText(body.creditContactEmail, 320) });
    await supabaseAdmin.from("career_application_stage_history").insert({ application_id: app.id, to_stage: "submitted", change_reason: "Application submitted" });
    await supabaseAdmin.from("career_email_events").insert({ application_id: app.id, template_key: "career_application_received", recipient_email: email, subject: "We received your TheOutHaven application", status: "queued" });
    if ((req.headers.get("content-type") || "").includes("application/json")) return NextResponse.json({ success: true, message: "Thanks for applying to TheOutHaven. We received your application." });
    redirect("/careers/apply/success");
  } catch (error) {
    console.error("Career application submit failed", error);
    return NextResponse.json({ error: "We could not submit your application. Please try again." }, { status: 500 });
  }
}
