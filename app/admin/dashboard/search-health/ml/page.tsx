import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

export const dynamic = "force-dynamic";

function Card({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div>{detail ? <div className="mt-1 text-sm text-white/55">{detail}</div> : null}</div>;
}

export default async function SearchMlHealthPage() {
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
  const modes = [
    ["Semantic", config.semanticMode], ["Reranking", config.rerankMode], ["Intent", config.intentMode], ["Query memory", config.queryMemoryMode],
    ["Learning", config.learningMode], ["Menu", config.menuMode], ["Location tags", config.locationTagMode], ["Photo intelligence", config.photoIntelligenceMode], ["Personalization", config.personalizationMode],
  ];
  return <main className="min-h-screen bg-[#07111f] px-6 py-8 text-white">
    <div className="mx-auto max-w-7xl">
      <div className="mb-8"><div className="text-sm font-medium text-cyan-300">Search Health</div><h1 className="mt-1 text-3xl font-semibold">ML Control Center</h1><p className="mt-2 max-w-3xl text-sm text-white/60">Hugging Face retrieval, learning, menu intelligence, tagging, photo scoring and personalization. Authentication secrets are intentionally never displayed.</p></div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map(([label, value]) => <Card key={label} label={label} value={String(value).toUpperCase()} />)}
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Location vectors" value={locationVectors.count ?? 0} detail={config.embeddingVersion} />
        <Card label="Menu item vectors" value={menuVectors.count ?? 0} />
        <Card label="Query memories" value={memories.count ?? 0} detail={`${approvedMemories.count ?? 0} approved`} />
        <Card label="Learning signals 24h" value={learning24h.count ?? 0} />
        <Card label="ML-tagged locations" value={tags.count ?? 0} />
        <Card label="Photo scores" value={photos.count ?? 0} detail={`${failedPhotos.count ?? 0} failed`} />
        <Card label="Preference vectors" value={preferences.count ?? 0} />
        <Card label="ML endpoint" value={config.endpoint ? "CONFIGURED" : "MISSING"} detail="Bearer token hidden" />
      </section>
      <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-lg font-semibold">Models</h2><div className="mt-4 grid gap-3 text-sm text-white/70 md:grid-cols-3"><div><div className="text-white/45">Embeddings / intent</div>{config.embeddingModel}</div><div><div className="text-white/45">Reranker</div>{config.rerankModel}</div><div><div className="text-white/45">Vision</div>{config.visionModel}</div></div></section>
    </div>
  </main>;
}
