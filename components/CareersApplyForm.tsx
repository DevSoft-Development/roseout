"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquareText,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import ClientTurnstile from "@/components/security/ClientTurnstile";

const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"];

type Question = { id: string; question_label: string; required?: boolean | null };
type Job = { id: string; title: string; resume_required?: boolean | null; requires_resume?: boolean | null };
type UploadedResume = { fileUrl: string; storagePath: string; originalName: string; mimeType: string; sizeBytes: number };
type Step = "contact" | "experience" | "questions" | "review";

const STEP_ORDER: Step[] = ["contact", "experience", "questions", "review"];
const STEP_META: Record<Step, { label: string; shortLabel: string; icon: typeof UserRound }> = {
  contact: { label: "Contact information", shortLabel: "Contact", icon: UserRound },
  experience: { label: "Experience & resume", shortLabel: "Experience", icon: FileText },
  questions: { label: "Role questions", shortLabel: "Questions", icon: MessageSquareText },
  review: { label: "Review & submit", shortLabel: "Review", icon: Send },
};

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

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-white/85">
      <span>{label}{required ? <span className="ml-1 text-rose-300">*</span> : null}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="min-h-12 rounded-xl border border-white/12 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-rose-300/50 focus:ring-2 focus:ring-rose-500/10"
      />
    </label>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
      <p className="text-[11px] font-black uppercase tracking-[0.13em] text-white/35">{label}</p>
      <p className="mt-1.5 break-words text-sm font-bold leading-6 text-white/80">{value || "Not provided"}</p>
    </div>
  );
}

export default function CareersApplyForm({
  job,
  questions,
  showMarketingLinks,
  showSchoolCredit,
  applicantNotice,
}: {
  job: Job;
  questions: Question[];
  showMarketingLinks: boolean;
  showSchoolCredit: boolean;
  applicantNotice?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const resumeRequired = isResumeRequired(job);
  const turnstileEnabled = process.env.NODE_ENV === "production" || Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const siteKeyMissing = turnstileEnabled && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const [step, setStep] = useState<Step>("contact");
  const [maxReached, setMaxReached] = useState(0);
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
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({});

  const stepIndex = STEP_ORDER.indexOf(step);
  const progressPercent = ((stepIndex + 1) / STEP_ORDER.length) * 100;
  const submitDisabled = useMemo(
    () => submitting || uploading || (turnstileEnabled && !siteKeyMissing && !turnstileToken),
    [siteKeyMissing, submitting, turnstileEnabled, turnstileToken, uploading],
  );

  const uploadResume = useCallback(async (file: File) => {
    setResume(null);
    setFileName(file.name);
    const validation = validateResumeFile(file);
    if (validation) {
      setUploadMessage(validation);
      return;
    }
    setUploading(true);
    setUploadMessage("Uploading resume…");
    const formData = new FormData();
    formData.set("resume", file);
    try {
      const response = await fetch("/api/careers/upload-resume", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Resume upload failed. You can try again or add a resume link.");
      setResume(data);
      setUploadMessage("Resume uploaded and ready.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Resume upload failed. You can try again or add a resume link.");
    } finally {
      setUploading(false);
    }
  }, []);

  function scrollToWizard() {
    window.setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  }

  function validateStep(targetStep: Step) {
    const form = formRef.current;
    if (!form) return false;
    const section = form.querySelector<HTMLElement>(`[data-application-step="${targetStep}"]`);
    if (!section) return true;

    const controls = Array.from(section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"));
    for (const control of controls) {
      if (control.type === "hidden" || !control.required) continue;
      if (!control.checkValidity()) {
        control.reportValidity();
        control.focus();
        return false;
      }
    }

    if (targetStep === "experience" && resumeRequired && !resume?.storagePath && !resumeLink.trim()) {
      setUploadMessage("Please upload your resume or add a resume link before continuing.");
      return false;
    }

    return true;
  }

  function goNext() {
    setMessage("");
    if (!validateStep(step)) return;
    const nextIndex = Math.min(stepIndex + 1, STEP_ORDER.length - 1);
    const next = STEP_ORDER[nextIndex];
    setMaxReached((current) => Math.max(current, nextIndex));
    if (next === "review") captureReviewValues();
    setStep(next);
    scrollToWizard();
  }

  function goBack() {
    setMessage("");
    const previous = STEP_ORDER[Math.max(0, stepIndex - 1)];
    setStep(previous);
    scrollToWizard();
  }

  function goToStep(next: Step) {
    const nextIndex = STEP_ORDER.indexOf(next);
    if (nextIndex > maxReached) return;
    setMessage("");
    if (next === "review") captureReviewValues();
    setStep(next);
    scrollToWizard();
  }

  function captureReviewValues() {
    const form = formRef.current;
    if (!form) {
      setReviewValues({});
      return;
    }
    const values: Record<string, string> = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") values[key] = value.trim();
    });
    setReviewValues(values);
  }

  function formValue(name: string) {
    return reviewValues[name] ?? "";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    for (const requiredStep of ["contact", "experience", "questions"] as Step[]) {
      if (!validateStep(requiredStep)) {
        setStep(requiredStep);
        setMaxReached((current) => Math.max(current, STEP_ORDER.indexOf(requiredStep)));
        scrollToWizard();
        return;
      }
    }

    const terms = event.currentTarget.elements.namedItem("terms") as HTMLInputElement | null;
    if (!terms?.checked) {
      setMessage("Please confirm the application certification before submitting.");
      return;
    }
    if (turnstileEnabled && !siteKeyMissing && !turnstileToken) {
      setTurnstileMessage("Please complete the security check before applying.");
      return;
    }

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
      const response = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
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

  const requiredQuestionCount = questions.filter((question) => question.required).length;
  const answeredQuestionCount = questions.filter((question) => formValue(`question_${question.id}`)).length;

  return (
    <div ref={wizardRef} className="scroll-mt-4">
      <form ref={formRef} onSubmit={submit} noValidate className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#101012] shadow-2xl shadow-black/30">
        <input type="hidden" name="jobId" value={job.id} />

        <div className="border-b border-white/10 bg-black/15 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Application</p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">{STEP_META[step].label}</h2>
            </div>
            <p className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black text-white/55">Step {stepIndex + 1} of {STEP_ORDER.length}</p>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/7">
            <div className="h-full rounded-full bg-[#ec0b5b] transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-white/10 bg-black/10">
          {STEP_ORDER.map((item, index) => {
            const active = item === step;
            const complete = index < stepIndex || index < maxReached;
            const enabled = index <= maxReached;
            const Icon = STEP_META[item].icon;
            return (
              <button
                key={item}
                type="button"
                disabled={!enabled}
                onClick={() => goToStep(item)}
                className={`px-1.5 py-4 text-center transition sm:px-3 ${active ? "bg-white/[0.065] text-white" : enabled ? "text-white/50 hover:bg-white/[0.03] hover:text-white/75" : "cursor-not-allowed text-white/25"}`}
              >
                <span className={`mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black ${active ? "bg-[#ec0b5b] text-white" : complete ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5"}`}>
                  {complete && !active ? <Check size={14} strokeWidth={3} /> : <Icon size={14} strokeWidth={2.5} />}
                </span>
                <span className="hidden text-xs font-black sm:inline">{STEP_META[item].label}</span>
                <span className="text-[11px] font-black sm:hidden">{STEP_META[item].shortLabel}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5 sm:p-7">
          <section data-application-step="contact" className={step === "contact" ? "block" : "hidden"}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff2142]">Step 1 of 4</p>
            <h3 className="mt-2 text-2xl font-black">Tell us how to reach you</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Start with the basics. We only use this information to manage your application and communicate with you about this opportunity.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field name="firstName" label="First name" required autoComplete="given-name" />
              <Field name="lastName" label="Last name" required autoComplete="family-name" />
              <Field name="email" label="Email address" type="email" required autoComplete="email" />
              <Field name="phone" label="Phone number" type="tel" autoComplete="tel" />
              <Field name="city" label="City" autoComplete="address-level2" />
              <Field name="state" label="State" autoComplete="address-level1" />
            </div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/50">
              Your application is private and visible only to authorized members of TheOutHaven&apos;s hiring team.
            </div>
          </section>

          <section data-application-step="experience" className={step === "experience" ? "block" : "hidden"}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff2142]">Step 2 of 4</p>
            <h3 className="mt-2 text-2xl font-black">Share your experience</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Upload a resume and, if relevant, add work samples or professional links that help us understand your experience.</p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-black">Resume {resumeRequired ? <span className="text-rose-300">*</span> : null}</h4>
                  <p className="mt-1 text-xs leading-5 text-white/50">PDF, DOC, or DOCX · maximum 5 MB</p>
                </div>
                {resume?.storagePath ? <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-200">Uploaded</span> : null}
              </div>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadResume(file);
                }}
                className="mt-4 block w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white file:mr-4 file:rounded-lg file:border-0 file:bg-[#ec0b5b] file:px-4 file:py-2 file:text-sm file:font-black file:text-white"
              />
              {fileName ? <p className="mt-2 text-xs text-white/55">Selected: {fileName}</p> : null}
              {uploadMessage ? <p className={`mt-2 text-xs font-bold ${resume?.storagePath ? "text-emerald-200" : "text-rose-100"}`}>{uploadMessage}</p> : null}
              <div className="mt-4 border-t border-white/10 pt-4">
                <Field name="resumeLink" label="Resume link fallback" type="url" placeholder="https://…" value={resumeLink} onChange={setResumeLink} />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <h4 className="font-black">Professional links</h4>
              <p className="mt-1 text-xs leading-5 text-white/50">Optional. Share only links you want considered for job-related experience.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field name="linkedinUrl" label="LinkedIn URL" type="url" placeholder="https://linkedin.com/in/…" />
                <Field name="portfolioUrl" label="Portfolio URL" type="url" placeholder="https://…" />
                <Field name="websiteUrl" label="Website URL" type="url" placeholder="https://…" />
                <Field name="socialHandle" label="Professional / work social handle" placeholder="@yourhandle" />
              </div>
              {showMarketingLinks ? <div className="mt-4"><Field name="marketingPortfolioUrl" label="Additional marketing / social portfolio URL" type="url" placeholder="https://…" /></div> : null}
            </div>
          </section>

          <section data-application-step="questions" className={step === "questions" ? "block" : "hidden"}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff2142]">Step 3 of 4</p>
            <h3 className="mt-2 text-2xl font-black">Tell us about your fit for the role</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">These questions are reviewed by people on our hiring team. Focus on job-related skills, experience, availability, and the work you&apos;re excited to do.</p>

            <label className="mt-6 grid gap-2 text-sm font-bold text-white/85">
              <span>Why are you interested in this opportunity?</span>
              <textarea name="coverLetter" placeholder="Tell us what interests you about the role and TheOutHaven…" className="min-h-36 rounded-xl border border-white/12 bg-black/30 p-4 text-white outline-none transition placeholder:text-white/25 focus:border-rose-300/50 focus:ring-2 focus:ring-rose-500/10" />
            </label>

            {questions.length ? (
              <div className="mt-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black">Role-specific questions</h4>
                  <span className="text-xs font-bold text-white/40">{requiredQuestionCount} required</span>
                </div>
                {questions.map((question) => (
                  <label key={question.id} className="grid gap-2 text-sm font-bold text-white/85">
                    <span>{question.question_label}{question.required ? <span className="ml-1 text-rose-300">*</span> : null}</span>
                    <textarea
                      name={`question_${question.id}`}
                      required={Boolean(question.required)}
                      className="min-h-28 rounded-xl border border-white/12 bg-black/30 p-4 text-white outline-none transition focus:border-rose-300/50 focus:ring-2 focus:ring-rose-500/10"
                    />
                    <input type="hidden" name={`question_label_${question.id}`} value={question.question_label} />
                  </label>
                ))}
              </div>
            ) : null}

            {showSchoolCredit ? (
              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/[0.08] p-5">
                <h4 className="font-black text-amber-50">School credit details</h4>
                <p className="mt-1 text-xs leading-5 text-white/55">Complete this only if your internship participation is connected to a school or academic program.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field name="schoolName" label="School name" />
                  <Field name="programName" label="Program name" />
                  <div className="sm:col-span-2"><Field name="creditContactEmail" label="School contact email" type="email" /></div>
                </div>
              </div>
            ) : null}
          </section>

          <section data-application-step="review" className={step === "review" ? "block" : "hidden"}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ff2142]">Step 4 of 4</p>
            <h3 className="mt-2 text-2xl font-black">Review and submit</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Check the summary below. You can go back to any completed step to make changes before submitting.</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <ReviewItem label="Name" value={`${formValue("firstName")} ${formValue("lastName")}`.trim()} />
              <ReviewItem label="Email" value={formValue("email")} />
              <ReviewItem label="Phone" value={formValue("phone")} />
              <ReviewItem label="Location" value={[formValue("city"), formValue("state")].filter(Boolean).join(", ")} />
              <ReviewItem label="Resume" value={resume?.originalName || resumeLink || "Not provided"} />
              <ReviewItem label="Role questions" value={`${answeredQuestionCount} of ${questions.length} answered`} />
            </div>

            <button type="button" onClick={() => goToStep("contact")} className="mt-4 text-sm font-black text-rose-200 hover:text-white">Edit application details</button>

            <div className="mt-6 rounded-2xl border border-blue-300/15 bg-blue-500/[0.055] p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-100"><ShieldCheck size={18} /></div>
                <div>
                  <h4 className="font-black text-blue-100">Equal opportunity & accommodations</h4>
                  <p className="mt-2 text-sm leading-6 text-white/60">{applicantNotice || "TheOutHaven is an equal opportunity employer. Reasonable accommodations are available during the application and hiring process."}</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">If you need a reasonable accommodation for the application or interview process, contact <a className="font-black text-blue-100 underline" href="mailto:support@theouthaven.com?subject=Applicant%20Accommodation%20Request">support@theouthaven.com</a>. Accommodation requests are handled separately from candidate evaluation.</p>
                </div>
              </div>
            </div>

            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/70">
              <input name="terms" value="yes" type="checkbox" className="mt-1 h-4 w-4 accent-[#ec0b5b]" />
              <span>I confirm the information in this application is accurate and agree TheOutHaven may contact me about this application.</span>
            </label>

            {turnstileEnabled ? (
              <div className="mt-5 grid gap-2">
                <ClientTurnstile
                  key={turnstileKey}
                  resetKey={turnstileKey}
                  action="careers_apply"
                  theme="dark"
                  onToken={(token) => { setTurnstileToken(token); setTurnstileMessage(""); }}
                  onExpire={() => { setTurnstileToken(""); setTurnstileMessage("Please complete the security check before applying."); }}
                  onError={() => { setTurnstileToken(""); setTurnstileMessage("Security check could not load. Please refresh and try again."); }}
                />
                {siteKeyMissing && process.env.NODE_ENV !== "production" ? <p className="text-xs text-white/45">Turnstile is not configured in this environment.</p> : null}
                {turnstileMessage ? <p className="text-xs font-bold text-amber-100">{turnstileMessage}</p> : null}
              </div>
            ) : null}
          </section>

          {message ? <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{message}</p> : null}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
            {stepIndex > 0 ? (
              <button type="button" onClick={goBack} disabled={submitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-black text-white/75 transition hover:bg-white/[0.07] disabled:opacity-50">
                <ChevronLeft size={17} /> Back
              </button>
            ) : <span />}

            {step !== "review" ? (
              <button type="button" onClick={goNext} disabled={uploading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ec0b5b] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#ff176b] disabled:cursor-not-allowed disabled:opacity-60">
                {uploading ? "Uploading…" : "Continue"} <ChevronRight size={17} />
              </button>
            ) : (
              <button disabled={submitDisabled} type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ec0b5b] px-6 py-2.5 text-sm font-black text-white transition hover:bg-[#ff176b] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? "Submitting application…" : "Submit application"} <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      <p className="mt-4 text-center text-xs leading-5 text-white/35">You can move back through completed steps without losing the information you entered.</p>
    </div>
  );
}
