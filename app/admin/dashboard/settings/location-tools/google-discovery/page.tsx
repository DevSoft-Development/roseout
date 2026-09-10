import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { ActionToolsClient } from "@/components/admin/location-tools/ActionToolsClient";
import { GoogleDiscoveryReviewList } from "@/components/admin/location-tools/GoogleDiscoveryReviewList";

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
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  website?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  activity_type?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
  quality_score?: number | string | null;
  quality_status?: string | null;
  import_status?: string | null;
  duplicate_status?: string | null;
  rejection_reason?: string | null;
  main_image?: string | null;
  source_url?: string | null;
  has_photos?: boolean | null;
  photo_status?: string | null;
  import_confidence?: string | null;
  source_quality_status?: string | null;
  public_visibility_tier?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  raw_payload?: Record<string, unknown> | null;
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
      .select("id,batch_id,name,location_type,address,city,state,zip_code,phone,website,primary_category,cuisine,activity_type,rating,review_count,quality_score,quality_status,import_status,duplicate_status,rejection_reason,main_image,source_url,has_photos,photo_status,import_confidence,source_quality_status,public_visibility_tier,latitude,longitude,raw_payload,created_at")
      .eq("source", SOURCE)
      .order("created_at", { ascending: false })
      .limit(500),
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

export default async function GoogleDiscoveryPage() {
  await requireAdminRole(["superadmin", "admin"]);
  const { batches, candidates, error } = await loadData();
  const published = candidates.filter((row) => row.import_status === "published").length;
  const review = candidates.filter((row) => row.import_status === "staged" && row.quality_status === "review").length;
  const rejected = candidates.filter((row) => row.import_status === "rejected").length;
  const duplicates = candidates.filter((row) => row.import_status === "duplicate").length;

  return (
    <LocationToolShell
      title="Curated Google Discovery"
      description="Google is a discovery source, not an automatic directory feed. Use the review workspace to make evidence-based publish, hide, reject, category-correction and batch decisions across the current queue."
      stats={[
        { label: "Published in loaded set", value: published, tone: "emerald" },
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
            <p><span className="text-white">Manual correction:</span> fixing a category immediately re-runs the same quality evaluator against stored Google evidence. It does not make another Google API call.</p>
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

      <ToolCard title="Google review decision workspace" description="Filter by review reason, inspect the exact Google evidence, correct categories, and take single or batch decisions. Approvals enter the normal publish pipeline immediately; ambiguous candidates can remain hidden without being deleted.">
        {candidates.length ? (
          <GoogleDiscoveryReviewList candidates={candidates} />
        ) : (
          <p className="text-sm font-bold text-white/45">No curated Google candidates have been staged yet.</p>
        )}
      </ToolCard>
    </LocationToolShell>
  );
}
