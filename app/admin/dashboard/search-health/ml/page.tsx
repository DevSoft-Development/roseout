import Link from "next/link";
import { requireAdmin } from "@/lib/admin/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSearchMlRuntimeConfig, type HfSearchMode } from "@/lib/search/huggingFaceEmbedding";
import { updateSearchMlMode } from "./actions";

export const dynamic = "force-dynamic";

type ModeKey =
  | "semantic"
  | "reranking"
  | "intent"
  | "query_memory"
  | "learning"
  | "menu"
  | "location_tags"
  | "photo_intelligence"
  | "personalization";

type ModeDefinition = {
  key: ModeKey;
  label: string;
  value: HfSearchMode;
  detail: string;
  servedBehavior: boolean;
};

function Card({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-sm text-white/55">{detail}</div> : null}
    </div>
  );
}

function ModeCard({ definition }: { definition: ModeDefinition }) {
  const modes: HfSearchMode[] = ["disabled", "enabled"];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{definition.label}</div>
          <div className="mt-2 text-lg font-semibold text-white">{definition.value.toUpperCase()}</div>
        </div>
        {definition.servedBehavior ? (
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200">
            Ranking path
          </span>
        ) : (
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-200">
            Background
          </span>
        )}
      </div>
      <p className="mt-2 min-h-10 text-sm leading-5 text-white/55">{definition.detail}</p>
      <form action={updateSearchMlMode} className="mt-4 grid grid-cols-2 gap-2">
        <input type="hidden" name="key" value={definition.key} />
        {modes.map((mode) => {
          const active = definition.value === mode;
          return (
            <button
              key={mode}
              type="submit"
              name="mode"
              value={mode}
              aria-pressed={active}
              className={[
                "rounded-lg border px-2 py-2 text-xs font-bold uppercase tracking-wide transition",
                active
                  ? mode === "enabled"
                    ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
                    : "border-white/20 bg-white/10 text-white"
                  : "border-white/10 bg-black/10 text-white/45 hover:border-white/25 hover:text-white/80",
              ].join(" ")}
            >
              {mode}
            </button>
          );
        })}
      </form>
    </div>
  );
}

export default async function SearchMlHealthPage() {
  await requireAdmin();
  const config = await resolveSearchMlRuntimeConfig();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [locationVectors, menuVectors, memories, approvedMemories, learning24h, tags, photos, preferences, failedPhotos] = await Promise.all([
    supabaseAdmin.from("location_search_embeddings_hf").select("location_id", { count: "exact", head: true }).eq("status", "ready").eq("embedding_version", config.embeddingVersion),
    supabaseAdmin.from("location_menu_item_embeddings_hf").select("id", { count: "exact", head: true }).eq("status", "ready").eq("embedding_version", config.embeddingVersion),
    supabaseAdmin.from("search_semantic_query_memory").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("search_semantic_query_memory").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
    supabaseAdmin.from("search_ml_learning_events").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabaseAdmin.from("location_ml_attributes").select("location_id", { count: "exact", head: true }).eq("status", "ready"),
    supabaseAdmin.from("location_photo_ml_scores").select("id", { count: "exact", head: true }).eq("status", "ready"),
    supabaseAdmin.from("user_search_preference_vectors").select("user_id", { count: "exact", head: true }).eq("status", "ready"),
    supabaseAdmin.from("location_photo_ml_scores").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const modes: ModeDefinition[] = [
    { key: "semantic", label: "Semantic retrieval", value: config.semanticMode, detail: "Meaning-based location and food candidate retrieval layered behind deterministic constraints.", servedBehavior: true },
    { key: "reranking", label: "Reranking", value: config.rerankMode, detail: "Cross-encoder relevance adjustment on a bounded top-candidate set.", servedBehavior: true },
    { key: "intent", label: "Intent classifier", value: config.intentMode, detail: "Small model fills missing semantic slots only when deterministic parsing leaves uncertainty.", servedBehavior: true },
    { key: "query_memory", label: "Query memory", value: config.queryMemoryMode, detail: "Reuses approved high-similarity interpretations from successful searches.", servedBehavior: true },
    { key: "learning", label: "Learning signals", value: config.learningMode, detail: "Collects deduplicated search outcome signals for future model improvements.", servedBehavior: false },
    { key: "menu", label: "Menu intelligence", value: config.menuMode, detail: "Creates semantic vectors for signature dishes and canonical food terms; exact menu evidence stays stronger.", servedBehavior: false },
    { key: "location_tags", label: "Location tagging", value: config.locationTagMode, detail: "Derives supporting vibe, occasion and feature tags from canonical location evidence.", servedBehavior: false },
    { key: "photo_intelligence", label: "Photo intelligence", value: config.photoIntelligenceMode, detail: "Background scene/quality scoring for food, interiors, exteriors, rooftops and merchandising—not face recognition.", servedBehavior: false },
    { key: "personalization", label: "Personalization", value: config.personalizationMode, detail: "Applies a small authenticated-user preference boost after deterministic relevance scoring.", servedBehavior: true },
  ];

  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/admin/dashboard/search-health" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
              ← Search Health
            </Link>
            <h1 className="mt-2 text-3xl font-semibold">ML Control Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/60">
              Hugging Face retrieval, learning, menu intelligence, tagging, photo scoring and personalization. Authentication secrets are intentionally never displayed.
            </p>
          </div>
          <div className="max-w-xl rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-sm leading-5 text-amber-100/90">
            Runtime features are <strong>Disabled or Enabled</strong>. Enable only after the AWS service health and authenticated model checks pass; every search-path ML feature remains fail-open to the deterministic search path.
          </div>
        </div>

        <section>
          <h2 className="text-lg font-semibold">Runtime controls</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modes.map((definition) => <ModeCard key={definition.key} definition={definition} />)}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Coverage & learning</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Location vectors" value={locationVectors.count ?? 0} detail={config.embeddingVersion} />
            <Card label="Menu item vectors" value={menuVectors.count ?? 0} />
            <Card label="Query memories" value={memories.count ?? 0} detail={`${approvedMemories.count ?? 0} approved`} />
            <Card label="Learning signals 24h" value={learning24h.count ?? 0} />
            <Card label="ML-tagged locations" value={tags.count ?? 0} />
            <Card label="Photo scores" value={photos.count ?? 0} detail={`${failedPhotos.count ?? 0} failed`} />
            <Card label="Preference vectors" value={preferences.count ?? 0} />
            <Card label="ML endpoint" value={config.endpoint ? "CONFIGURED" : "MISSING"} detail="Bearer token hidden" />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold">Models</h2>
          <div className="mt-4 grid gap-3 text-sm text-white/70 md:grid-cols-3">
            <div><div className="text-white/45">Embeddings / intent</div>{config.embeddingModel}</div>
            <div><div className="text-white/45">Reranker</div>{config.rerankModel}</div>
            <div><div className="text-white/45">Vision</div>{config.visionModel}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
