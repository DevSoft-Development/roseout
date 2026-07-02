"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { AdminActionButton, AdminSectionCard } from "@/components/admin/AdminDesignSystem";
import type { CareerJob } from "@/lib/careers/types";

const statuses = ["draft", "open", "paused", "closed", "filled", "archived"];
const visibilities = ["public", "private_link", "internal_only", "hidden"];
const internshipTypes = ["paid", "unpaid_educational", "college_credit", "stipend", "campus_ambassador", "creator_program"];
const workplaceTypes = ["remote", "hybrid", "onsite"];
const employmentTypes = ["full_time", "part_time", "contract", "internship", "commission", "temporary"];
const compensationTypes = ["", "salary", "hourly", "stipend", "commission", "unpaid"];

type FormState = Partial<CareerJob>;

function text(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function numberText(value: unknown) { return typeof value === "number" ? String(value) : text(value); }
function cleanNumber(value: unknown) { const raw = text(value).trim(); if (!raw) return null; const parsed = Number(raw); return Number.isFinite(parsed) ? parsed : null; }
function label(value: string) { return value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Not set"; }

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-2"><span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</span>{children}{helper ? <span className="block text-xs font-semibold leading-5 text-white/45">{helper}</span> : null}</label>;
}
function inputClass() { return "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-rose-300/50 focus:ring-4 focus:ring-rose-300/10"; }
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={inputClass()} />; }
function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={inputClass()} />; }
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`${inputClass()} min-h-28 leading-6`} />; }
function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white/75"><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)} className="h-4 w-4 accent-[#ec0b5b]" />{label}</label>; }

export function CareerJobEditForm({ job, mode = "edit" }: { job?: Partial<CareerJob>; mode?: "edit" | "create" }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ status: "draft", visibility: "hidden", workplace_type: "remote", employment_type: "full_time", is_internship: false, is_paid: true, supports_college_credit: false, requires_school_credit: false, ...job });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewHref = useMemo(() => form.slug ? `/careers/${form.slug}` : null, [form.slug]);
  const update = (key: keyof FormState, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null); setError(null);
    const payload: Record<string, unknown> = {};
    const textFields = ["title","slug","department","subdepartment","role_track","location","workplace_type","employment_type","compensation_type","compensation_text","summary","overview","responsibilities","requirements","nice_to_have","benefits","schedule","hiring_process","status","visibility","internship_type","learning_objectives","compliance_status","compliance_notes"] as const;
    textFields.forEach((key) => { const value = text(form[key]).trim(); payload[key] = value || null; });
    ["compensation_min","compensation_max","weekly_hours_min","weekly_hours_max","program_duration_weeks"].forEach((key) => { payload[key] = cleanNumber(form[key as keyof FormState]); });
    ["is_internship","is_paid","supports_college_credit","requires_school_credit"].forEach((key) => { payload[key] = Boolean(form[key as keyof FormState]); });
    try {
      const response = await fetch(mode === "create" ? "/api/admin/careers/jobs" : `/api/admin/careers/jobs/${job?.id}`, { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.record) throw new Error("save_failed");
      setMessage(mode === "create" ? "Job posting created." : "Job posting updated.");
      if (mode === "create") router.push(`/admin/dashboard/careers/jobs/${data.record.id}`); else router.refresh();
    } catch { setError(mode === "create" ? "We could not create this job posting." : "We could not update this job posting."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={onSubmit} className="space-y-5">
    {(message || error) ? <div className={`rounded-2xl border p-4 text-sm font-bold ${error ? "border-red-300/25 bg-red-500/10 text-red-100" : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"}`}>{error || message}</div> : null}
    <AdminSectionCard className="p-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Role Title"><TextInput value={text(form.title)} onChange={(e)=>update("title", e.target.value)} required /></Field><Field label="Public URL Slug" helper="Changing the slug changes the public job posting URL."><TextInput value={text(form.slug)} onChange={(e)=>update("slug", e.target.value.toLowerCase())} required /></Field><Field label="Department"><TextInput value={text(form.department)} onChange={(e)=>update("department", e.target.value)} /></Field><Field label="Subdepartment"><TextInput value={text(form.subdepartment)} onChange={(e)=>update("subdepartment", e.target.value)} /></Field><Field label="Role Track"><TextInput value={text(form.role_track)} onChange={(e)=>update("role_track", e.target.value)} /></Field><Field label="Location"><TextInput value={text(form.location)} onChange={(e)=>update("location", e.target.value)} /></Field><Field label="Workplace Type"><SelectInput value={text(form.workplace_type)} onChange={(e)=>update("workplace_type", e.target.value)}>{workplaceTypes.map((v)=><option key={v} value={v}>{label(v)}</option>)}</SelectInput></Field><Field label="Employment Type"><SelectInput value={text(form.employment_type)} onChange={(e)=>update("employment_type", e.target.value)}>{employmentTypes.map((v)=><option key={v} value={v}>{label(v)}</option>)}</SelectInput></Field></div></AdminSectionCard>
    <AdminSectionCard className="p-5"><div className="grid gap-4 md:grid-cols-3"><Field label="Compensation"><SelectInput value={text(form.compensation_type)} onChange={(e)=>update("compensation_type", e.target.value)}>{compensationTypes.map((v)=><option key={v || "none"} value={v}>{label(v)}</option>)}</SelectInput></Field><Field label="Compensation Min"><TextInput type="number" value={numberText(form.compensation_min)} onChange={(e)=>update("compensation_min", e.target.value)} /></Field><Field label="Compensation Max"><TextInput type="number" value={numberText(form.compensation_max)} onChange={(e)=>update("compensation_max", e.target.value)} /></Field><Field label="Compensation Text"><TextInput value={text(form.compensation_text)} onChange={(e)=>update("compensation_text", e.target.value)} /></Field><Field label="Status"><SelectInput value={text(form.status)} onChange={(e)=>update("status", e.target.value)}>{statuses.map((v)=><option key={v} value={v}>{label(v)}</option>)}</SelectInput></Field><Field label="Visibility"><SelectInput value={text(form.visibility)} onChange={(e)=>update("visibility", e.target.value)}>{visibilities.map((v)=><option key={v} value={v}>{label(v)}</option>)}</SelectInput></Field></div></AdminSectionCard>
    <AdminSectionCard className="p-5"><div className="grid gap-4"><Field label="Public Summary"><TextArea value={text(form.summary)} onChange={(e)=>update("summary", e.target.value)} /></Field><Field label="Role Overview"><TextArea value={text(form.overview)} onChange={(e)=>update("overview", e.target.value)} /></Field><Field label="Responsibilities"><TextArea value={text(form.responsibilities)} onChange={(e)=>update("responsibilities", e.target.value)} /></Field><Field label="Requirements"><TextArea value={text(form.requirements)} onChange={(e)=>update("requirements", e.target.value)} /></Field><Field label="Nice to Have"><TextArea value={text(form.nice_to_have)} onChange={(e)=>update("nice_to_have", e.target.value)} /></Field><Field label="Benefits"><TextArea value={text(form.benefits)} onChange={(e)=>update("benefits", e.target.value)} /></Field><Field label="Schedule"><TextArea value={text(form.schedule)} onChange={(e)=>update("schedule", e.target.value)} /></Field><Field label="Hiring Process"><TextArea value={text(form.hiring_process)} onChange={(e)=>update("hiring_process", e.target.value)} /></Field></div></AdminSectionCard>
    <AdminSectionCard className="p-5"><div className="grid gap-4 md:grid-cols-2"><Checkbox label="Internship Role" checked={Boolean(form.is_internship)} onChange={(v)=>update("is_internship", v)} /><Checkbox label="Paid Role" checked={Boolean(form.is_paid)} onChange={(v)=>update("is_paid", v)} /><Checkbox label="Supports College Credit" checked={Boolean(form.supports_college_credit)} onChange={(v)=>update("supports_college_credit", v)} /><Checkbox label="Requires School Credit" checked={Boolean(form.requires_school_credit)} onChange={(v)=>update("requires_school_credit", v)} /><Field label="Internship Type"><SelectInput value={text(form.internship_type)} onChange={(e)=>update("internship_type", e.target.value)}><option value="">Not set</option>{internshipTypes.map((v)=><option key={v} value={v}>{label(v)}</option>)}</SelectInput></Field><Field label="Weekly Hours Min"><TextInput type="number" value={numberText(form.weekly_hours_min)} onChange={(e)=>update("weekly_hours_min", e.target.value)} /></Field><Field label="Weekly Hours Max"><TextInput type="number" value={numberText(form.weekly_hours_max)} onChange={(e)=>update("weekly_hours_max", e.target.value)} /></Field><Field label="Program Duration"><TextInput type="number" value={numberText(form.program_duration_weeks)} onChange={(e)=>update("program_duration_weeks", e.target.value)} /></Field><Field label="Compliance Status"><TextInput value={text(form.compliance_status)} onChange={(e)=>update("compliance_status", e.target.value)} /></Field><Field label="Compliance Notes"><TextArea value={text(form.compliance_notes)} onChange={(e)=>update("compliance_notes", e.target.value)} /></Field><div className="md:col-span-2"><Field label="Learning Objectives"><TextArea value={text(form.learning_objectives)} onChange={(e)=>update("learning_objectives", e.target.value)} /></Field></div></div></AdminSectionCard>
    <div className="flex flex-wrap gap-2"><AdminActionButton type="submit" variant="primary">{saving ? "Saving…" : mode === "create" ? "Create Job" : "Save Changes"}</AdminActionButton><AdminActionButton href="/admin/dashboard/careers/jobs">Back to Jobs</AdminActionButton>{previewHref ? <Link href={previewHref} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-white/80 hover:border-rose-200/30">Preview Public Posting</Link> : null}</div>
  </form>;
}
