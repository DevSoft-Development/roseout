"use client";

import { useMemo, useState } from "react";
import {
  getEnhancementFieldsForTable,
  inputToTagsArray,
  isArrayEnhancementField,
  isBooleanEnhancementField,
  isJsonEnhancementField,
  jsonValueToInput,
  parseJsonInput,
  tagsArrayToInput,
  type EnhancementFieldName,
  type EnhancementFormState,
  type LocationTableName,
} from "@/lib/listing-enhancement";

type EnhancementRecord = Partial<Record<EnhancementFieldName, unknown>>;

type Props = {
  table: LocationTableName;
  id: string;
  record: EnhancementRecord;
  canEdit: boolean;
};

type Group = { title: string; fields: EnhancementFieldName[] };

const GROUPS: Group[] = [
  { title: "Search Identity", fields: ["primary_tag", "tags", "search_keywords", "semantic_tags", "intent_tags", "review_keywords"] },
  { title: "Vibe & Occasion", fields: ["vibe_tags", "mood_tags", "best_for_tags", "date_style_tags", "special_features"] },
  { title: "Details", fields: ["cuisine_tags", "price_range", "price_level", "dress_code"] },
  { title: "Hours", fields: ["hours", "hours_of_operation", "operating_hours", "special_hours"] },
  { title: "Booking & Social", fields: ["reservation_url", "reservation_link", "external_reservation_url", "reservation_enabled", "reservation_type", "reservation_source", "internal_reservations_enabled", "uses_internal_reservations", "instagram_url", "owner_instagram"] },
];

function labelFor(field: EnhancementFieldName) {
  return field.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function initialValue(field: EnhancementFieldName, value: unknown) {
  if (isArrayEnhancementField(field)) return tagsArrayToInput(value);
  if (isJsonEnhancementField(field)) return jsonValueToInput(value);
  if (isBooleanEnhancementField(field)) return Boolean(value);
  return String(value ?? "");
}

export default function ListingEnhancementEditor({ table, id, record, canEdit }: Props) {
  const allowedFields = useMemo(() => new Set(getEnhancementFieldsForTable(table)), [table]);
  const fields = useMemo(() => GROUPS.map((group) => ({ ...group, fields: group.fields.filter((field) => allowedFields.has(field)) })).filter((group) => group.fields.length > 0), [allowedFields]);
  const [values, setValues] = useState<Partial<Record<EnhancementFieldName, string | boolean>>>(() => {
    const next: Partial<Record<EnhancementFieldName, string | boolean>> = {};
    for (const field of allowedFields) next[field] = initialValue(field, record[field]);
    return next;
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    const next: Partial<Record<EnhancementFieldName, string | boolean>> = {};
    for (const field of allowedFields) next[field] = initialValue(field, record[field]);
    setValues(next);
    setError(null);
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setError(null);
    const updates: EnhancementFormState = {};
    for (const field of allowedFields) {
      const value = values[field];
      if (isArrayEnhancementField(field)) updates[field] = inputToTagsArray(String(value ?? ""));
      else if (isBooleanEnhancementField(field)) updates[field] = Boolean(value);
      else if (isJsonEnhancementField(field)) {
        const parsed = parseJsonInput(String(value ?? ""));
        if (!parsed.ok) {
          setStatus("error");
          setError(`${labelFor(field)}: ${parsed.error}`);
          return;
        }
        updates[field] = parsed.value;
      } else updates[field] = String(value ?? "").trim() || null;
    }

    const response = await fetch("/api/admin/crm/location-enhancement", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, id, updates }),
    });
    const data = (await response.json()) as { success?: boolean; error?: string };
    if (!response.ok || !data.success) {
      setStatus("error");
      setError(data.error || "Could not save listing enhancement fields.");
      return;
    }
    setStatus("saved");
  }

  return <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Listing Enhancement</p>
        <h2 className="mt-2 text-2xl font-black">Listing Enhancement</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Update the search signals customers use to find this place.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 lg:justify-end">
        <button type="button" onClick={save} disabled={!canEdit || status === "saving"} className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{status === "saving" ? "Saving…" : "Save"}</button>
        <button type="button" onClick={reset} disabled={!canEdit || status === "saving"} className="rounded-full border border-white/10 bg-black/20 px-5 py-2.5 text-sm font-bold text-white/75 disabled:opacity-50">Cancel</button>
      </div>
    </div>
    {status === "saved" ? <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-100">Saved listing enhancement fields.</p> : null}
    {error ? <p className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{error}</p> : null}
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      {fields.map((group) => <article key={group.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white/55">{group.title}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {group.fields.map((field) => {
            const label = labelFor(field);
            if (isBooleanEnhancementField(field)) return <label key={field} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-white/70"><input type="checkbox" checked={Boolean(values[field])} disabled={!canEdit} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.checked }))} />{label}</label>;
            if (isJsonEnhancementField(field)) return <label key={field} className="space-y-2 text-sm font-bold text-white/65 sm:col-span-2"><span>{label} JSON</span><textarea value={String(values[field] ?? "")} disabled={!canEdit} rows={4} placeholder='{"monday":["11:30 AM - 10:00 PM"]}' onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-white outline-none disabled:opacity-60" /></label>;
            return <label key={field} className={`space-y-2 text-sm font-bold text-white/65 ${isArrayEnhancementField(field) ? "sm:col-span-2" : ""}`}><span>{label}</span><input value={String(values[field] ?? "")} disabled={!canEdit} placeholder={isArrayEnhancementField(field) ? "romantic, rooftop, birthday, girls night" : undefined} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-60" /></label>;
          })}
        </div>
      </article>)}
    </div>
    {!canEdit ? <p className="mt-4 text-sm text-white/45">Viewer role is read-only.</p> : null}
  </section>;
}
