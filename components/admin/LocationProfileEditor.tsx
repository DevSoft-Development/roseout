"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Clock3, Save, Search, Sparkles } from "lucide-react";
import LocationEditorHoursPanel from "@/components/location-editor/LocationEditorHoursPanel";
import { PRICE_RANGE_OPTIONS, normalizeTagList } from "@/lib/location-profile-fields";

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

type FormState = {
  description: string;
  primary_tag: string;
  cuisine: string;
  price_range: string;
  semantic_tags: string;
  best_for_tags: string;
  operating_hours: unknown;
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

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm font-bold text-white/70">
      <span>{label}</span>
      {children}
      {helper ? (
        <p className="text-xs font-medium leading-5 text-white/40">{helper}</p>
      ) : null}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-white/45">
        {description}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
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
  const initial = useMemo<FormState>(
    () => ({
      description: String(record.description ?? ""),
      primary_tag: String(record.primary_tag ?? ""),
      cuisine: String(record.cuisine ?? ""),
      price_range: String(record.price_range ?? ""),
      semantic_tags:
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
      best_for_tags: arr(record.best_for_tags) || arr(record.best_for),
      operating_hours: record.operating_hours ?? null,
    }),
    [record],
  );

  const [form, setForm] = useState<FormState>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initial));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [ai, setAi] = useState<any>(null);

  const hasChanges = savedSnapshot !== JSON.stringify(form);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus("");
  };

  async function save() {
    setSaving(true);
    setStatus("");
    const updates = {
      description: form.description,
      primary_tag: form.primary_tag,
      cuisine: form.cuisine,
      price_range: form.price_range,
      semantic_tags: normalizeTagList(form.semantic_tags),
      best_for_tags: normalizeTagList(form.best_for_tags),
      operating_hours: form.operating_hours,
    };

    try {
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
      if (!response.ok) throw new Error(data.error || "Could not save profile fields.");
      setSavedSnapshot(JSON.stringify(form));
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save profile fields.");
    } finally {
      setSaving(false);
    }
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
        description: form.description,
        primary_tag: form.primary_tag,
        cuisine: form.cuisine,
        semantic_tags: form.semantic_tags,
        best_for_tags: form.best_for_tags,
        best_for: record.best_for,
        category: record.category,
        primary_category: record.primary_category,
        price_range: form.price_range,
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

  function applyAll() {
    if (!ai) return;
    setForm((current) => ({
      ...current,
      description: ai.description ? String(ai.description) : current.description,
      primary_tag: ai.primary_tag ? String(ai.primary_tag) : current.primary_tag,
      cuisine: ai.cuisine ? String(ai.cuisine) : current.cuisine,
      price_range: ai.price_range ? String(ai.price_range) : current.price_range,
      semantic_tags: mergeTags(current.semantic_tags, ai.semantic_tags),
      best_for_tags: mergeTags(current.best_for_tags, ai.best_for_tags),
    }));
    setAiStatus("Suggestions applied. Save when ready.");
  }

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-20 rounded-3xl border border-white/10 bg-[#090b0f]/95 p-4 shadow-xl backdrop-blur-xl sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">
              Location profile
            </p>
            <h2 className="mt-1 text-2xl font-black">Edit the essentials</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-white/45">
              Keep the customer-facing profile simple. Search tuning and system data are available below only when you need them.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!canEdit || saving || !hasChanges}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#e1062a] to-[#ff2142] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-[#ff1654]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={16} />
            {saving ? "Saving..." : hasChanges ? "Save changes" : "Saved"}
          </button>
        </div>
        {status ? (
          <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/75">
            {status}
          </p>
        ) : null}
      </div>

      <Section
        title="Profile essentials"
        description="The main information guests and search use to understand this location."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary tag" helper="The clearest one-line identity for this location.">
            <input
              value={form.primary_tag}
              onChange={(event) => set("primary_tag", event.target.value)}
              placeholder="Rooftop bar, Italian restaurant, pottery studio..."
              className={inputClass}
            />
          </Field>
          <Field label="Cuisine" helper="Use only when cuisine is relevant.">
            <input
              value={form.cuisine}
              onChange={(event) => set("cuisine", event.target.value)}
              placeholder="Italian, Caribbean, Seafood..."
              className={inputClass}
            />
          </Field>
          <Field label="Price range">
            <select
              value={form.price_range}
              onChange={(event) => set("price_range", event.target.value)}
              className={inputClass}
            >
              <option value="">Select price range</option>
              {PRICE_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" helper="Tell guests what to expect without overloading the profile.">
              <textarea
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                rows={5}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title="Business hours"
        description="Use the same day-by-day editor location owners use. No raw hours text or manual formatting."
      >
        <LocationEditorHoursPanel
          value={form.operating_hours}
          importedHours={
            record.google_opening_hours ??
            record.google_regular_opening_hours ??
            record.google_hours ??
            record.regularOpeningHours ??
            record.weekday_text
          }
          isAdmin={false}
          onChange={(hours) => set("operating_hours", hours)}
        />
      </Section>

      <details className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <summary className="cursor-pointer list-none">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-white/70">
              <Search size={18} />
            </div>
            <div>
              <h3 className="text-lg font-black">Search & matching</h3>
              <p className="mt-1 text-sm font-semibold text-white/45">
                Optional internal tuning. Most edits do not require this section.
              </p>
            </div>
          </div>
        </summary>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Search boost tags" helper="Terms that improve discovery and matching.">
            <textarea
              value={form.semantic_tags}
              onChange={(event) => set("semantic_tags", event.target.value)}
              rows={4}
              placeholder="romantic, live music, girls night"
              className={inputClass}
            />
          </Field>
          <Field label="Best for" helper="Occasions and use cases this location fits best.">
            <textarea
              value={form.best_for_tags}
              onChange={(event) => set("best_for_tags", event.target.value)}
              rows={4}
              placeholder="date night, brunch, family outing"
              className={inputClass}
            />
          </Field>
        </div>
      </details>

      {aiHelperEnabled ? (
        <details className="rounded-3xl border border-rose-300/20 bg-rose-950/15 p-5 sm:p-6">
          <summary className="cursor-pointer list-none">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-500/15 text-rose-200">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-lg font-black">AI profile helper</h3>
                <p className="mt-1 text-sm font-semibold text-white/45">
                  Generate optional suggestions only when you want them. {aiHelperAccessLabel ?? ""}
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
                <p className="text-sm leading-6 text-white/65">
                  Suggestions are ready for description, primary tag, cuisine, price range, search tags, and best-for tags.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyAll}
                    className="rounded-full bg-white px-4 py-2 text-xs font-black text-black"
                  >
                    Apply all suggestions
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
        <details className="rounded-3xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <summary className="cursor-pointer">
            <span className="text-lg font-black">Advanced / system data</span>
            <p className="mt-1 text-sm font-semibold text-white/40">
              Import and search diagnostics. Hidden by default to keep the profile editor usable.
            </p>
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              ["Review keywords", record.review_keywords],
              ["Search document", record.search_document],
              ["Semantic search text", record.semantic_search_text],
              ["Operating hours JSON", form.operating_hours],
              ["Special hours JSON", record.special_hours],
            ].map(([label, value]) => (
              <Field key={String(label)} label={String(label)}>
                <textarea
                  readOnly
                  rows={5}
                  value={
                    Array.isArray(value)
                      ? value.join(", ")
                      : value && typeof value === "object"
                        ? JSON.stringify(value, null, 2)
                        : String(value ?? "")
                  }
                  className={`${inputClass} font-mono text-xs`}
                />
              </Field>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
