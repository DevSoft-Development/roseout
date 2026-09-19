import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Clock3,
  MapPin,
  WalletCards,
} from "lucide-react";
import {
  getCompensationLabel,
  getInternshipTypeLabel,
  requiresInternshipComplianceChecklist,
} from "@/lib/careers/format";
import { getPublicCareerJobBySlug } from "@/lib/careers/queries";

function cleanCopy(value: unknown) {
  if (!value) return "";
  return String(value).replace(/\\n/g, "\n").trim();
}

function humanize(value: unknown) {
  const text = cleanCopy(value);
  if (!text) return "";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function getPublicPayLabel(job: any) {
  const minimum = money(job.compensation_min);
  const maximum = money(job.compensation_max);
  const type = cleanCopy(job.compensation_type).toLowerCase();
  const cadence = type === "hourly" ? " per hour" : type === "salary" ? " per year" : type === "stipend" ? " stipend" : "";

  if (minimum && maximum) return minimum === maximum ? `${minimum}${cadence}` : `${minimum}–${maximum}${cadence}`;
  if (minimum || maximum) return `${minimum || maximum}${cadence}`;
  return getCompensationLabel(job);
}

function JobSection({ title, value }: { title: string; value: unknown }) {
  const copy = cleanCopy(value);
  if (!copy) return null;

  const lines = copy.split("\n").map((line) => line.trim()).filter(Boolean);
  const listLike = lines.length > 1 && lines.every((line) => /^[-•]|^\d+[.)]/.test(line));

  return (
    <section className="border-b border-white/10 py-7 last:border-b-0">
      <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
      {listLike ? (
        <ul className="mt-4 space-y-3 text-[15px] leading-7 text-white/70">
          {lines.map((line, index) => (
            <li className="flex gap-3" key={`${title}-${index}`}>
              <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ec0b5b]" />
              <span>{line.replace(/^[-•]\s*/, "").replace(/^\d+[.)]\s*/, "")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-4 text-[15px] leading-7 text-white/70">
          {lines.map((line, index) => <p key={`${title}-${index}`}>{line}</p>)}
        </div>
      )}
    </section>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-200">
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">{label}</p>
        <p className="mt-1 text-sm font-bold leading-5 text-white/85">{value}</p>
      </div>
    </div>
  );
}

export default async function CareerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job: any = await getPublicCareerJobBySlug(slug);
  if (!job) notFound();

  const compensation = getPublicPayLabel(job);
  const roleType = humanize(job.employment_type) || (job.is_internship ? "Internship" : "Opportunity");
  const location = cleanCopy(job.location) || "Remote";
  const schedule = cleanCopy(job.schedule) || (job.weekly_hours_min ? `${job.weekly_hours_min} hours per week` : "Schedule shared during hiring");

  const sections = [
    ["About the role", job.overview || job.summary],
    ["What you’ll do", job.responsibilities],
    ["What we’re looking for", job.requirements],
    ["Nice to have", job.nice_to_have],
    ["What you’ll gain", job.learning_objectives],
    ["Benefits", job.benefits],
    ["Hiring process", job.hiring_process || "Applications are reviewed by TheOutHaven. Qualified candidates may be invited to a structured interview, work-sample review, or offer conversation."],
  ] as const;

  return (
    <main className="min-h-screen bg-[#050505] pb-24 text-white lg:pb-0">
      <div className="border-b border-white/10 bg-[#09090b]">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-white/65 transition hover:text-rose-200" href="/careers">
            <ArrowLeft size={16} />
            Back to jobs
          </Link>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
          <div className="min-w-0">
            <header className="rounded-3xl border border-white/10 bg-[#101012] p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-rose-100">TheOutHaven</span>
                {job.is_internship ? <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-bold text-white/70">{getInternshipTypeLabel(job.internship_type)}</span> : null}
              </div>

              <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.08]">{job.title}</h1>
              <p className="mt-3 text-sm font-medium text-white/55">{job.department || "TheOutHaven"} · {location}</p>

              {job.summary ? <p className="mt-6 max-w-3xl text-base leading-7 text-white/70">{cleanCopy(job.summary)}</p> : null}

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <DetailRow icon={WalletCards} label="Pay" value={compensation} />
                <DetailRow icon={Clock3} label="Schedule" value={schedule} />
                <DetailRow icon={BriefcaseBusiness} label="Job type" value={roleType} />
                <DetailRow icon={MapPin} label="Location" value={location} />
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href={`/careers/${job.slug}/apply`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ec0b5b] px-7 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-[#ff176b] focus:outline-none focus:ring-2 focus:ring-rose-300">
                  Apply now
                </Link>
                <span className="text-xs leading-5 text-white/40">Application submitted directly to TheOutHaven.</span>
              </div>
            </header>

            {requiresInternshipComplianceChecklist(job) ? (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/[0.08] p-4 text-sm leading-6 text-amber-50/85">
                This opportunity is structured as an educational internship and may require school documentation for college-credit participation.
              </div>
            ) : null}

            <article className="mt-5 rounded-3xl border border-white/10 bg-[#101012] px-6 sm:px-8">
              {sections.map(([title, value]) => <JobSection key={title} title={title} value={value} />)}

              <section className="py-7">
                <h2 className="text-xl font-black tracking-tight text-white">Equal opportunity & accommodations</h2>
                <p className="mt-4 text-sm leading-7 text-white/60">
                  TheOutHaven is an equal opportunity employer. Reasonable accommodations are available during the application and hiring process.
                </p>
              </section>
            </article>
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-6">
            <div className="rounded-3xl border border-white/10 bg-[#101012] p-5 shadow-2xl shadow-black/20">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Interested in this role?</p>
              <h2 className="mt-2 text-xl font-black leading-7 text-white">Apply to TheOutHaven</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">Submit your application and our hiring team will review it against the published job requirements.</p>
              <Link href={`/careers/${job.slug}/apply`} className="mt-5 inline-flex w-full min-h-12 items-center justify-center rounded-xl bg-[#ec0b5b] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff176b] focus:outline-none focus:ring-2 focus:ring-rose-300">
                Apply now
              </Link>
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/35">Pay</p>
                <p className="mt-1 text-sm font-bold text-white/80">{compensation}</p>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-white/35">Location</p>
                <p className="mt-1 text-sm font-bold text-white/80">{location}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#09090b]/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{job.title}</p>
            <p className="truncate text-xs text-white/50">{compensation}</p>
          </div>
          <Link href={`/careers/${job.slug}/apply`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#ec0b5b] px-5 py-2.5 text-sm font-black text-white">
            Apply now
          </Link>
        </div>
      </div>
    </main>
  );
}
