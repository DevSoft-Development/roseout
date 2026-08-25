import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { ActionToolsClient } from "@/components/admin/location-tools/ActionToolsClient";

export const dynamic = "force-dynamic";

const SOURCE = "google_curated_discovery";
const EASTERN_TIME_ZONE = "America/New_York";

type Batch = {
  id: string;
  source_label?: string | null;
  status?: string | null;
  total_seen?: number | null;
  total_staged?: number | null;
  total_duplicates?: number | null;
  total_rejected?: number | null;
  total_publish_ready?: number | null;
  total_published?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Candidate = {
  id: string;
  batch_id?: string | null;
  name?: string | null;
  location_type?: string | null;
  city?: string | null;
  state?: string | null;
  primary_category?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
  quality_score?: number | string | null;
  quality_status?: string | null;
  import_status?: string | null;
  rejection_reason?: string | null;
  main_image?: string | null;
  created_at?: string | null;
};

async function loadData() {
  const [batchResult, candidateResult] = await Promise.all([
    supabaseAdmin
      .from("location_import_batches")
      .select("id,source_label,status,total_seen,total_staged,total_duplicates,total_rejected,total_publish_ready,total_published,started_at,completed_at,metadata")
      .eq("source", SOURCE)
      .order("started_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("location_import_staging")
      .select("id,batch_id,name,location_type,city,state,primary_category,rating,review_count,quality_score,quality_status,import_status,rejection_reason,main_image,created_at")
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return {
    batches: (batchResult.data || []) as Batch[],
    candidates: (candidateResult.data || []) as Candidate[],
    error: batchResult.error?.message || candidateResult.error?.message || null,
  };
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEasternDateTime(value: string | null | undefined) {
  if (!value) return "No start time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid start time";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function tone(candidate: Candidate) {
  if (candidate.import_status === "published") return "border-emerald-400/20 bg-emerald-500/[0.07]";
  if (candidate.import_status === "rejected" || candidate.import_status === "duplicate") return "border-red-400/15 bg-red-500/[0.05]";
  return "border-amber-300/15 bg-amber-400/[0.06]";
}

function label(candidate: Candidate) {
  if (candidate.import_status === "published") return "Published";
  if (candidate.import_status === "duplicate") return "Duplicate";
  if (candidate.import_status === "rejected") return "Rejected";
  if (candidate.quality_status === "publish_ready") return "Approved · ready to publish";
  if (candidate.quality_status === "needs_photo") return "Review · photo needed";
  return "Manual review";
}

export default async function GoogleDiscoveryPage() {
  await requireAdminRole(["superadmin", "admin"]);
  const { batches, candidates, error } = await loadData();
  const published = candidates.filter((row) => row.import_status === "published").length;
  const review = candidates.filter((row) => row.import_status === "staged" && row.quality_status !== "publish_ready").length;
  const rejected = candidates.filter((row) => row.import_status === "rejected").length;
  const duplicates = candidates.filter((row) => row.import_status === "duplicate").length;

  return (
    <LocationToolShell
      title="Curated Google Discovery"
      description="Google is a discovery source, not an automatic directory feed. TheOutHaven now fills neighborhood and town gaps with both core coverage and curated finds, blocks chains and low-quality results, enriches approved locations, and keeps borderline candidates here for review."
      stats={[
        { label: "Recent published", value: published, tone: "emerald" },
        { label: "Needs review", value: review, tone: "amber" },
        { label: "Rejected", value: rejected, tone: "rose" },
        { label: "Duplicates blocked", value: duplicates, tone: "white" },
      ]}
    >
      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-bold text-red-100">
          Curated discovery data could not be loaded: {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.55fr)]">
        <ToolCard
          title="Run curated discovery"
          description="Restaurants and activities run separately. Each run mixes core inventory such as restaurants, bars, lounges and hookah with curated finds such as hidden gems, speakeasies and first-time activities."
        >
          <ActionToolsClient
            warning="These actions use the same production quality gates as the nightly jobs. Only high-confidence candidates can publish automatically; hidden gems and other subjective candidates stay staged for review."
            actions={[
              {
                label: "Discover restaurants",
                endpoint: "/api/admin/location-growth/google-curated-discovery",
                body: { kind: "restaurant", maxPlans: 8, resultsPerPlan: 10, maxCandidates: 60, autoPublish: true },
                tone: "rose",
              },
              {
                label: "Discover activities",
                endpoint: "/api/admin/location-growth/google-curated-discovery",
                body: { kind: "activity", maxPlans: 8, resultsPerPlan: 10, maxCandidates: 60, autoPublish: true },
                tone: "white",
              },
            ]}
          />
        </ToolCard>

        <ToolCard title="Automatic quality policy" description="Search terms never count as proof that a place has a feature.">
          <div className="space-y-3 text-sm font-bold text-white/65">
            <p><span className="text-white">Core restaurants:</span> auto-publish requires at least 4.4 stars, 200 reviews, complete location data, website, hours, a usable photo, and actual place evidence of outing value.</p>
            <p><span className="text-white">Core activities/nightlife:</span> auto-publish requires at least 4.4 stars and 100 reviews plus the same completeness gates.</p>
            <p><span className="text-white">Hidden gems:</span> 4.4 stars / 25 reviews can enter manual review, but the subjective hidden-gem label never auto-publishes from the search phrase alone.</p>
            <p><span className="text-white">First-time activities:</span> niche workshops can enter review at 4.3 stars / 20 reviews and can auto-publish at 4.5 stars / 50 reviews when the venue itself provides strong activity evidence.</p>
            <p><span className="text-white">Automatic rejection:</span> missing reputation, rating below the applicable floor, very low review volume, wrong market, known chains, quick-service patterns, or invalid location data.</p>
            <p><span className="text-white">Before publication:</span> Google photos use a live Place-ID proxy rather than permanent photo storage. Photos requiring author attribution stay in review until the UI can render that attribution. Published locations immediately run reservation-link discovery without overwriting owner or internal reservation settings.</p>
          </div>
        </ToolCard>
      </div>

      <ToolCard title="Recent discovery batches" description="The planner chooses neighborhood/town inventory gaps instead of repeating the same broad borough searches every night. Times are shown in Eastern Time.">
        {batches.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {batches.map((batch) => {
              const metadata = batch.metadata && typeof batch.metadata === "object" ? batch.metadata : {};
              const kind = String((metadata as Record<string, unknown>).kind || "discovery");
              return (
                <article key={batch.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black capitalize text-white">{kind}</p>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white/55">{batch.status || "unknown"}</span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-white/40">{formatEasternDateTime(batch.started_at)}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
                    <div className="rounded-xl bg-white/[0.05] p-2"><div className="text-lg text-white">{number(batch.total_seen)}</div><div className="text-white/35">Seen</div></div>
                    <div className="rounded-xl bg-amber-400/[0.08] p-2"><div className="text-lg text-amber-100">{number(batch.total_staged)}</div><div className="text-white/35">Staged</div></div>
                    <div className="rounded-xl bg-emerald-500/[0.08] p-2"><div className="text-lg text-emerald-100">{number(batch.total_published)}</div><div className="text-white/35">Published</div></div>
                    <div className="rounded-xl bg-red-500/[0.06] p-2"><div className="text-lg text-red-100">{number(batch.total_rejected)}</div><div className="text-white/35">Rejected</div></div>
                    <div className="rounded-xl bg-white/[0.05] p-2"><div className="text-lg text-white">{number(batch.total_duplicates)}</div><div className="text-white/35">Dupes</div></div>
                    <div className="rounded-xl bg-rose-500/[0.08] p-2"><div className="text-lg text-rose-100">{number(batch.total_publish_ready)}</div><div className="text-white/35">Approved</div></div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm font-bold text-white/45">No curated Google discovery batches have run yet.</p>
        )}
      </ToolCard>

      <ToolCard title="Recent Google candidates" description="This is the audit trail for what Google returned and how TheOutHaven handled it.">
        {candidates.length ? (
          <div className="space-y-2">
            {candidates.map((candidate) => (
              <article key={candidate.id} className={`rounded-2xl border p-4 ${tone(candidate)}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-white">{candidate.name || "Unnamed Google candidate"}</h3>
                      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white/65">{label(candidate)}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-white/50">
                      {[candidate.city, candidate.state, candidate.primary_category].filter(Boolean).join(" · ") || "Location/category unavailable"}
                    </p>
                    {candidate.rejection_reason ? <p className="mt-2 text-xs font-bold text-amber-100/75">Reason: {candidate.rejection_reason.replace(/_/g, " ")}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-black text-white/65">
                    <span className="rounded-full bg-black/25 px-3 py-1.5">★ {number(candidate.rating).toFixed(1)}</span>
                    <span className="rounded-full bg-black/25 px-3 py-1.5">{number(candidate.review_count).toLocaleString()} reviews</span>
                    <span className="rounded-full bg-black/25 px-3 py-1.5">Score {number(candidate.quality_score)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm font-bold text-white/45">No curated Google candidates have been staged yet.</p>
        )}
      </ToolCard>
    </LocationToolShell>
  );
}