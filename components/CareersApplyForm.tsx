"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ClientTurnstile from "@/components/security/ClientTurnstile";

const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"];

type Question = { id: string; question_label: string; required?: boolean | null };
type Job = { id: string; title: string; resume_required?: boolean | null; requires_resume?: boolean | null };
type UploadedResume = { fileUrl: string; storagePath: string; originalName: string; mimeType: string; sizeBytes: number };

function isResumeRequired(job: Job) {
  return Boolean(job.resume_required || job.requires_resume);
}

function validateResumeFile(file: File) {
  const name = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_RESUME_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!ALLOWED_RESUME_TYPES.has(file.type) || !hasAllowedExtension) return "Please upload a PDF, DOC, or DOCX resume.";
  if (file.size > MAX_RESUME_SIZE) return "Please upload a resume smaller than 5 MB.";
  return "";
}

function Field({ label, name, type = "text", required, placeholder, value, onChange }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; value?: string; onChange?: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-bold">{label}<input name={name} type={type} required={required} placeholder={placeholder} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className="rounded-xl border border-white/10 bg-black/30 p-3 text-white placeholder:text-white/30" /></label>;
}

export default function CareersApplyForm({ job, questions, showMarketingLinks, showSchoolCredit }: { job: Job; questions: Question[]; showMarketingLinks: boolean; showSchoolCredit: boolean }) {
  const router = useRouter();
  const resumeRequired = isResumeRequired(job);
  const turnstileEnabled = process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const siteKeyMissing = turnstileEnabled && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [resume, setResume] = useState<UploadedResume | null>(null);
  const [resumeLink, setResumeLink] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileMessage, setTurnstileMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const submitDisabled = useMemo(() => submitting || uploading || (turnstileEnabled && !siteKeyMissing && !turnstileToken), [siteKeyMissing, submitting, turnstileEnabled, turnstileToken, uploading]);

  const uploadResume = useCallback(async (file: File) => {
    setResume(null);
    setFileName(file.name);
    const validation = validateResumeFile(file);
    if (validation) { setUploadMessage(validation); return; }
    setUploading(true);
    setUploadMessage("Uploading resume…");
    const formData = new FormData();
    formData.set("resume", file);
    try {
      const response = await fetch("/api/careers/upload-resume", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Resume upload failed. You can try again or add a resume link.");
      setResume(data);
      setUploadMessage("Resume uploaded.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Resume upload failed. You can try again or add a resume link.");
    } finally {
      setUploading(false);
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (turnstileEnabled && !siteKeyMissing && !turnstileToken) { setTurnstileMessage("Please complete the security check before applying."); return; }
    if (resumeRequired && !resume?.storagePath && !resumeLink.trim()) { setMessage("Please upload your resume or add a resume link."); return; }
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    Object.assign(payload, {
      resumeUrl: resume?.storagePath || resumeLink.trim() || "",
      resumeStoragePath: resume?.storagePath || "",
      resumeOriginalName: resume?.originalName || "",
      resumeMimeType: resume?.mimeType || "",
      resumeSizeBytes: resume?.sizeBytes || "",
      turnstileToken,
    });
    try {
      const response = await fetch("/api/careers/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not submit your application. Please try again.");
      router.push("/careers/apply/success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not submit your application. Please try again.");
      setTurnstileToken("");
      setTurnstileKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return <form onSubmit={submit} className="mt-8 grid gap-4 rounded-3xl border border-white/10 bg-[#101012] p-5">
    <input type="hidden" name="jobId" value={job.id} />
    <div className="grid gap-4 sm:grid-cols-2"><Field name="firstName" label="First name" required /><Field name="lastName" label="Last name" required /><Field name="email" label="Email" type="email" required /><Field name="phone" label="Phone" /><Field name="city" label="City" /><Field name="state" label="State" /></div>
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><h2 className="font-black">Resume</h2><p className="mt-1 text-xs text-white/65">Upload your resume as a PDF, DOC, or DOCX file.</p><input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadResume(file); }} className="mt-3 block w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-[#ec0b5b] file:px-4 file:py-2 file:text-sm file:font-black file:text-white" />{fileName ? <p className="mt-2 text-xs text-white/55">Selected: {fileName}</p> : null}{uploadMessage ? <p className="mt-2 text-xs font-bold text-rose-100">{uploadMessage}</p> : null}<div className="mt-4"><Field name="resumeLink" label="Resume link fallback (optional)" type="url" placeholder="https://…" value={resumeLink} onChange={setResumeLink} /></div></section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><h2 className="font-black">Portfolio and links</h2><p className="mt-1 text-xs text-white/65">Optional: Add a portfolio, LinkedIn, website, or social media link that helps us understand your work.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field name="linkedinUrl" label="LinkedIn URL" type="url" /><Field name="portfolioUrl" label="Portfolio URL" type="url" /><Field name="websiteUrl" label="Website URL" type="url" /><Field name="socialHandle" label="Social handle" placeholder="@yourhandle" /></div></section>
    <label className="grid gap-2 text-sm font-bold">Cover letter / why interested<textarea name="coverLetter" className="min-h-32 rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>
    {questions.map((q) => <label key={q.id} className="grid gap-2 text-sm font-bold">{q.question_label}<textarea name={`question_${q.id}`} required={Boolean(q.required)} className="min-h-24 rounded-xl border border-white/10 bg-black/30 p-3 text-white" /><input type="hidden" name={`question_label_${q.id}`} value={q.question_label} /></label>)}
    {showMarketingLinks ? <div className="rounded-2xl bg-white/[0.04] p-4"><h2 className="font-black">Marketing / Social Links</h2><Field name="marketingPortfolioUrl" label="Additional content or social portfolio URL" type="url" /></div> : null}
    {showSchoolCredit ? <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4"><h2 className="font-black">School credit details</h2><p className="mt-1 text-xs text-white/65">Educational / college-credit internships may require school documentation.</p><Field name="schoolName" label="School name" /><Field name="programName" label="Program name" /><Field name="creditContactEmail" label="School contact email" type="email" /></div> : null}
    <label className="flex gap-3 text-sm text-white/70"><input name="terms" value="yes" type="checkbox" required /> I confirm the information is accurate and agree TheOutHaven may contact me about this application.</label>
    {turnstileEnabled ? <div className="grid gap-2"><ClientTurnstile key={turnstileKey} resetKey={turnstileKey} action="careers_apply" theme="dark" onToken={(token) => { setTurnstileToken(token); setTurnstileMessage(""); }} onExpire={() => { setTurnstileToken(""); setTurnstileMessage("Please complete the security check before applying."); }} onError={() => { setTurnstileToken(""); setTurnstileMessage("Security check could not load. Please refresh and try again."); }} />{siteKeyMissing && process.env.NODE_ENV !== "production" ? <p className="text-xs text-white/45">Turnstile is not configured in this environment.</p> : null}{turnstileMessage ? <p className="text-xs font-bold text-amber-100">{turnstileMessage}</p> : null}</div> : null}
    {message ? <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{message}</p> : null}
    <button disabled={submitDisabled} className="rounded-xl bg-[#ec0b5b] px-5 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60">{uploading ? "Uploading resume…" : submitting ? "Submitting…" : "Submit Application"}</button>
  </form>;
}
