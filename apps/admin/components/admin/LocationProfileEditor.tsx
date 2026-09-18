"use client";

import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { normalizeTagList } from "@/lib/location-profile-fields";

type Props = {
  table?: string;
  id: string;
  record: Record<string, any>;
  canEdit: boolean;
  canViewAdvancedSystemData: boolean;
  saveMode?: "admin" | "owner";
  type?: string;
  aiHelperEnabled?: boolean;
  aiHelperAccessLabel?: string;
};

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-[#ff2142]/60 focus:ring-4 focus:ring-[#e1062a]/10 disabled:opacity-60";

function arr(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function mergeTags(a: unknown, b: unknown) {
  return Array.from(
    new Set(
      [...normalizeTagList(a), ...normalizeTagList(b)]
        .map((tag) => tag.toLowerCase().trim())
        .filter(Boolean),
    ),
  ).join(", ");
}

export default function LocationProfileEditor({
  table = "locations",
  id,
  record,
  canEdit,
  canViewAdvancedSystemData,
  saveMode = "admin",
  type,
  aiHelperEnabled = false,
  aiHelperAccessLabel,
}: Props) {
  const [semanticTags, setSemanticTags] = useState(
    arr(record.semantic_tags) ||
      arr(
        [
          record.tags,
          record.search_keywords,
          record.intent_tags,
          record.vibe_tags,
          record.date_style_tags,
          record.special_features,
        ].flat(),
      ),
  );
  const [bestForTags, setBestForTags] = useState(
    arr(record.best_for_tags) || arr(record.best_for),
  );
  const [status, setStatus] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [ai, setAi] = useState<any>(null);

  async function saveSearchTuning() {
    setStatus("Saving...");
    const updates = {
      semantic_tags: normalizeTagList(semanticTags),
      best_for_tags: normalizeTagList(bestForTags),
    };
    const response = await fetch(
      saveMode === "owner"
        ? "/api/locations/edit-context"
        : "/api/admin/crm/location-enhancement",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          saveMode === "owner"
            ? { type, id, payload: updates }
            : { table, id, updates },
        ),
      },
    );
    const data = await response.json().catch(() => ({}));
    setStatus(response.ok ? "Search tuning saved." : data.error || "Could not save search tuning.");
  }

  async function generate() {
    setAiStatus("Generating suggestions...");
    setAi(null);
    const response = await fetch("/api/locations/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        table,
        type,
        name: record.name ?? record.restaurant_name ?? record.activity_name,
        description: record.description,
        primary_tag: record.primary_tag,
        cuisine: record.cuisine,
        semantic_tags: semanticTags,
        best_for_tags: bestForTags,
        best_for: record.best_for,
        category: record.category,
        primary_category: record.primary_category,
        price_range: record.price_range,
        city: record.city,
        neighborhood: record.neighborhood,
        location_type: record.location_type,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAiStatus(data.error || "AI suggestions failed.");
      return;
    }
    setAi(data.suggestions);
    setAiStatus("");
  }

  function applyAiTags() {
    if (!ai) return;
    setSemanticTags((current) => mergeTags(current, ai.semantic_tags));
    setBestForTags((current) => mergeTags(current, ai.best_for_tags));
    setAiStatus("AI search suggestions applied. Save when ready.");
  }

  return (
    <aside className="space-y-4">
      <details className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <summary className="cursor-pointer list-none">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-white/70">
              <Search size={18} />
            </div>
            <div>
              <h3 className="text-lg font-black">Search & matching</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-white/45">
                Optional internal tuning. Most profile edits do not require this section.
              </p>
            </div>
          </div>
        </summary>
        <div className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm font-bold text-white/70">
            <span>Search boost tags</span>
            <textarea
              value={semanticTags}
              onChange={(event) => setSemanticTags(event.target.value)}
              rows={4}
              placeholder="romantic, live music, girls night"
              className={inputClass}
            />
          </label>
          <label className="block space-y-2 text-sm font-bold text-white/70">
            <span>Best for</span>
            <textarea
              value={bestForTags}
              onChange={(event) => setBestForTags(event.target.value)}
              rows={4}
              placeholder="date night, brunch, family outing"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={saveSearchTuning}
            disabled={!canEdit}
            className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-black disabled:opacity-40"
          >
            Save search tuning
          </button>
          {status ? <p className="text-sm font-bold text-white/65">{status}</p> : null}
        </div>
      </details>

      {aiHelperEnabled ? (
        <details className="rounded-3xl border border-rose-300/20 bg-rose-950/15 p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-500/15 text-rose-200">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-lg font-black">AI profile helper</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-white/45">
                  Optional suggestions, hidden until needed. {aiHelperAccessLabel ?? ""}
                </p>
              </div>
            </div>
          </summary>
          <div className="mt-5">
            <button
              type="button"
              onClick={generate}
              disabled={!canEdit}
              className="rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              Generate suggestions
            </button>
            {aiStatus ? <p className="mt-3 text-sm font-bold text-white/70">{aiStatus}</p> : null}
            {ai ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm leading-6 text-white/60">
                  AI found optional search and best-for tags. Apply them only if they improve the location profile.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyAiTags}
                    className="rounded-full bg-white px-4 py-2 text-xs font-black text-black"
                  >
                    Apply search suggestions
                  </button>
                  <button
                    type="button"
                    onClick={() => setAi(null)}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {canViewAdvancedSystemData ? (
        <details className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <summary className="cursor-pointer">
            <span className="text-lg font-black">Advanced / system data</span>
            <p className="mt-1 text-sm font-semibold text-white/40">
              Import and search diagnostics are hidden by default.
            </p>
          </summary>
          <div className="mt-4 space-y-3">
            {[
              ["Review keywords", record.review_keywords],
              ["Search document", record.search_document],
              ["Semantic search text", record.semantic_search_text],
              ["Special hours JSON", record.special_hours],
            ].map(([label, value]) => (
              <label key={String(label)} className="block space-y-2 text-sm font-bold text-white/65">
                <span>{String(label)}</span>
                <textarea
                  readOnly
                  rows={4}
                  value={
                    Array.isArray(value)
                      ? value.join(", ")
                      : value && typeof value === "object"
                        ? JSON.stringify(value, null, 2)
                        : String(value ?? "")
                  }
                  className={`${inputClass} font-mono text-xs`}
                />
              </label>
            ))}
          </div>
        </details>
      ) : null}
    </aside>
  );
}
