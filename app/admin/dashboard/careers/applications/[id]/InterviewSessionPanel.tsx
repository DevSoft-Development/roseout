"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, Loader2, MessageSquareText, ShieldCheck, X } from "lucide-react";

type GuideQuestion = {
  id: string;
  competency: string;
  question: string;
  follow_up?: string;
  evidence_prompt?: string;
};

type InterviewPayload = {
  id: string;
  status: string | null;
  interview_guide?: GuideQuestion[] | null;
  interview_answers?: Array<{ questionId?: string; answer?: string }> | null;
  interview_live_notes?: string | null;
};

export default function InterviewSessionPanel({ applicationId, candidateName, onClose }: { applicationId: string; candidateName: string; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [interview, setInterview] = useState<InterviewPayload | null>(null);
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/admin/careers/applications/${applicationId}/interview-session`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "The interview workspace could not be loaded.");
        if (cancelled) return;
        const next = data.interview as InterviewPayload;
        setInterview(next);
        setNotes(next.interview_live_notes || "");
        setAnswers(Object.fromEntries((next.interview_answers || []).map((item) => [String(item.questionId || ""), String(item.answer || "")])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "The interview workspace could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  const guide = Array.isArray(interview?.interview_guide) ? interview!.interview_guide! : [];
  const answeredCount = useMemo(() => guide.filter((question) => (answers[question.id] || "").trim()).length, [answers, guide]);

  async function completeInterview() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/careers/applications/${applicationId}/interview-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, answers: guide.map((question) => ({ questionId: question.id, answer: answers[question.id] || "" })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The interview could not be completed.");
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The interview could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d]">
    <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
      <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-rose-200"><ClipboardList className="h-4 w-4" /> Live interview workspace</div><p className="mt-1 text-xl font-black">Structured interview — {candidateName}</p><p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">Ask the same role-specific core questions, capture the candidate&apos;s answer directly under each question, and use the live notes area for additional job-related observations.</p></div>
      <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 hover:text-white"><X className="h-4 w-4" /></button>
    </div>

    <div className="p-4 sm:p-5">
      {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading structured interview guide…</div> : null}
      {!loading && error ? <div className="rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</div> : null}

      {!loading && interview ? <>
        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-rose-200" /><p className="font-black">Live interviewer notes</p></div><p className="mt-1 text-xs leading-5 text-white/40">Use this for job-related observations that are not tied to one specific question. Notes remain internal.</p><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Capture job-related observations during the interview…" className="mt-3 min-h-32 w-full rounded-xl border border-white/10 bg-[#101012] p-3 text-base text-white" /></div>
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.06] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Interview completion</p><p className="mt-2 text-3xl font-black">{answeredCount}/{guide.length}</p><p className="mt-1 text-sm text-white/50">structured answers captured</p><div className="mt-4 flex gap-2 text-xs leading-5 text-white/45"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />Questions are generated from the role, not candidate demographics. Human evaluation remains authoritative.</div></div>
        </div>

        <div className="mt-5 space-y-4">{guide.map((question, index) => <section key={question.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
          <div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-sm font-black text-rose-100">{index + 1}</div><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200/80">{question.competency}</p><h3 className="mt-1 text-base font-black leading-6 text-white">{question.question}</h3>{question.follow_up ? <p className="mt-2 text-sm leading-6 text-white/45"><span className="font-black text-white/60">Follow-up:</span> {question.follow_up}</p> : null}</div></div>
          <label className="mt-4 block text-sm font-black text-white/70">Candidate answer / evidence<textarea value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder={question.evidence_prompt || "Capture the candidate's answer and specific evidence."} className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-base text-white" /></label>
        </section>)}</div>

        {!guide.length ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">This scheduled interview does not have a generated guide yet.</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm font-bold text-red-100">{error}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white/65">Back</button><button type="button" disabled={saving || !guide.length || answeredCount !== guide.length} onClick={() => void completeInterview()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="h-4 w-4" /> Complete structured interview <ArrowRight className="h-4 w-4" /></>}</button></div>
      </> : null}
    </div>
  </div>;
}
