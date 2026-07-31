import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalTaxonomy, type CanonicalTaxonomyEntry, type EvidenceField, type TaxonomyDomain } from "./index";

const CACHE_TTL_MS = 5 * 60 * 1000;
let active: readonly CanonicalTaxonomyEntry[] = canonicalTaxonomy;
let loadedAt = 0;
let loadPromise: Promise<void> | null = null;

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function rowToEntry(row: any): CanonicalTaxonomyEntry {
  const id = String(row.canonical_term);
  const aliases = textArray(row.aliases);
  const retrievalTerms = textArray(row.retrieval_terms);
  return {
    id,
    domain: String(row.domain) as TaxonomyDomain,
    aliases,
    retrievalTerms: retrievalTerms.length ? retrievalTerms : [id.replaceAll("_", " "), ...aliases],
    relatedCategories: textArray(row.related_terms),
    eligibleRoles: textArray(row.eligible_roles),
    evidenceRules: textArray(row.evidence_rules) as EvidenceField[],
    exclusions: textArray(row.negative_terms),
    incompatibleCategories: textArray(row.incompatible_domains),
    audienceRestrictions: textArray(row.audience_restrictions),
    mealPeriods: row.term_type === "meal_period" ? [id] : [],
    features: row.term_type === "feature" || row.term_type === "vibe" ? [id] : [],
  };
}

export async function hydrateRuntimeTaxonomy(supabase: SupabaseClient, force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < CACHE_TTL_MS) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { data, error } = await supabase
      .from("search_taxonomy_active")
      .select("canonical_term,domain,term_type,aliases,eligible_roles,retrieval_terms,evidence_rules,related_terms,negative_terms,incompatible_domains,audience_restrictions,version")
      .order("canonical_term");
    if (!error && data?.length) {
      active = data.map(rowToEntry);
      loadedAt = Date.now();
    }
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

export function runtimeTaxonomy(): readonly CanonicalTaxonomyEntry[] {
  return active;
}

export function runtimeTaxonomyEntry(id: string, domains?: readonly TaxonomyDomain[]): CanonicalTaxonomyEntry | undefined {
  const normalized = id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return active.find((item) => item.id === normalized && (!domains || domains.includes(item.domain)));
}

export function runtimeRetrievalTerms(id: string): readonly string[] {
  return runtimeTaxonomyEntry(id)?.retrievalTerms ?? [id.replaceAll("_", " ")];
}

export function runtimeAliases(id: string): readonly string[] {
  return runtimeTaxonomyEntry(id)?.aliases ?? [id.replaceAll("_", " ")];
}

export function runtimeEligibleRoles(id: string): readonly string[] {
  return runtimeTaxonomyEntry(id)?.eligibleRoles ?? [];
}

export function matchRuntimeTaxonomy(input: string, domains?: readonly TaxonomyDomain[]): CanonicalTaxonomyEntry[] {
  const normalized = input.toLowerCase().replace(/[_–—-]+/g, " ").replace(/[^a-z0-9+\s]/g, " ").replace(/\s+/g, " ").trim();
  return active.filter((item) => {
    if (domains && !domains.includes(item.domain)) return false;
    return [item.id.replaceAll("_", " "), ...item.aliases].some((alias) => {
      const term = alias.toLowerCase().replace(/[_–—-]+/g, " ").replace(/[^a-z0-9+\s]/g, " ").replace(/\s+/g, " ").trim();
      return term.length > 1 && new RegExp(`(?:^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`).test(normalized);
    });
  });
}

export function runtimeTaxonomyStatus() {
  return { source: active === canonicalTaxonomy ? "static_fallback" : "database", termCount: active.length, loadedAt: loadedAt || null };
}
