import type {
  RetrievalCandidate,
  RetrievalLaneResult,
  SearchIntentGraph,
  SearchRetrievalProvider,
  SearchV3Request,
} from "@/lib/search-framework";

export interface Bm25SupabaseClient {
  from(table: string): { select(columns?: string): any };
}

export interface Bm25RetrievalOptions {
  corpusLimit?: number;
  candidateLimit?: number;
  k1?: number;
  b?: number;
}

type LexicalRow = {
  location_id: string;
  search_text: string | null;
  canonical_terms: string[] | null;
  cuisines: string[] | null;
  foods: string[] | null;
  meal_periods: string[] | null;
  features: string[] | null;
  activity_categories: string[] | null;
  nightlife_categories: string[] | null;
  borough: string | null;
  city: string | null;
  neighborhood: string | null;
  market: string | null;
  supported_domains: string[] | null;
};

const SELECT_COLUMNS = [
  "location_id",
  "search_text",
  "canonical_terms",
  "cuisines",
  "foods",
  "meal_periods",
  "features",
  "activity_categories",
  "nightlife_categories",
  "borough",
  "city",
  "neighborhood",
  "market",
  "supported_domains",
].join(",");

const STOP_WORDS = new Set([
  "a","an","and","are","around","at","be","by","for","from","in","is","me",
  "near","of","on","or","the","to","with","within","want","find","show","give",
]);

export class SupabaseBm25RetrievalProvider implements SearchRetrievalProvider {
  readonly providerId = "theouthaven.supabase-bm25.v1";

  constructor(
    private readonly client: Bm25SupabaseClient,
    private readonly options: Bm25RetrievalOptions = {},
  ) {}

  async retrieve(args: {
    request: SearchV3Request;
    intent: SearchIntentGraph;
  }): Promise<RetrievalLaneResult> {
    const startedAt = Date.now();
    const corpusLimit = clamp(this.options.corpusLimit ?? 1000, 200, 2000);
    const candidateLimit = clamp(this.options.candidateLimit ?? 500, 50, 500);

    let query = this.client
      .from("location_search_profiles")
      .select(SELECT_COLUMNS)
      .limit(corpusLimit);

    if (args.intent.domains.length === 1) {
      query = query.contains("supported_domains", [args.intent.domains[0]]);
    }

    const resolvedGeo = resolvedGeoConstraint(args.intent);
    const borough = constraintValue(args.intent, "borough");
    if (borough) query = query.ilike("borough", borough);
    else if (resolvedGeo?.key === "borough") query = query.ilike("borough", resolvedGeo.value);
    else if (resolvedGeo?.key === "city") query = query.ilike("city", resolvedGeo.value);
    else if (resolvedGeo?.key === "neighborhood") query = query.ilike("neighborhood", resolvedGeo.value);
    else if (resolvedGeo?.key === "market") query = query.ilike("market", resolvedGeo.value);

    if (
      args.intent.anchor?.latitude != null &&
      args.intent.anchor?.longitude != null &&
      !resolvedGeo
    ) {
      const radiusMiles = anchorRadiusMiles(args.intent);
      const latDelta = radiusMiles / 69;
      const cosLat = Math.max(0.2, Math.cos(args.intent.anchor.latitude * Math.PI / 180));
      const lonDelta = radiusMiles / (69 * cosLat);
      query = query
        .gte("latitude", args.intent.anchor.latitude - latDelta)
        .lte("latitude", args.intent.anchor.latitude + latDelta)
        .gte("longitude", args.intent.anchor.longitude - lonDelta)
        .lte("longitude", args.intent.anchor.longitude + lonDelta);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as LexicalRow[];
    const queryTokens = buildQueryTokens(args.intent);
    if (rows.length === 0 || queryTokens.length === 0) {
      return {
        lane: "bm25",
        candidates: [],
        elapsedMs: Date.now() - startedAt,
        truncated: rows.length >= corpusLimit,
      };
    }

    const documents = rows.map((row) => ({
      row,
      tokens: tokenize(buildDocument(row)),
    }));

    const documentFrequency = new Map<string, number>();
    for (const token of new Set(queryTokens)) {
      let count = 0;
      for (const document of documents) {
        if (document.tokens.includes(token)) count += 1;
      }
      documentFrequency.set(token, count);
    }

    const avgLength = Math.max(
      1,
      documents.reduce((sum, document) => sum + document.tokens.length, 0) / documents.length,
    );
    const k1 = this.options.k1 ?? 1.2;
    const b = this.options.b ?? 0.75;

    const scored = documents
      .map((document) => {
        const score = bm25Score({
          documentTokens: document.tokens,
          queryTokens,
          documentCount: documents.length,
          documentFrequency,
          averageDocumentLength: avgLength,
          k1,
          b,
        });
        return { row: document.row, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, bValue) =>
        bValue.score - a.score ||
        a.row.location_id.localeCompare(bValue.row.location_id)
      )
      .slice(0, candidateLimit);

    const candidates: RetrievalCandidate[] = scored.map((item, index) => ({
      locationId: item.row.location_id,
      lane: "bm25",
      rank: index + 1,
      score: item.score,
      evidence: matchedQueryTokens(item.row, queryTokens),
      metadata: {
        lexicalModel: "bm25",
        k1,
        b,
      },
    }));

    return {
      lane: "bm25",
      candidates,
      elapsedMs: Date.now() - startedAt,
      truncated: rows.length >= corpusLimit || scored.length >= candidateLimit,
    };
  }
}

export function bm25Score(args: {
  documentTokens: readonly string[];
  queryTokens: readonly string[];
  documentCount: number;
  documentFrequency: ReadonlyMap<string, number>;
  averageDocumentLength: number;
  k1?: number;
  b?: number;
}): number {
  const k1 = args.k1 ?? 1.2;
  const b = args.b ?? 0.75;
  const frequencies = new Map<string, number>();
  for (const token of args.documentTokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  let score = 0;
  for (const token of new Set(args.queryTokens)) {
    const tf = frequencies.get(token) ?? 0;
    if (tf === 0) continue;

    const df = args.documentFrequency.get(token) ?? 0;
    const idf = Math.log(
      1 + (args.documentCount - df + 0.5) / (df + 0.5),
    );
    const denominator =
      tf + k1 * (
        1 - b +
        b * (args.documentTokens.length / Math.max(1, args.averageDocumentLength))
      );
    score += idf * ((tf * (k1 + 1)) / denominator);
  }

  return score;
}

function buildDocument(row: LexicalRow): string {
  return [
    row.search_text,
    ...(row.canonical_terms ?? []),
    ...(row.cuisines ?? []),
    ...(row.foods ?? []),
    ...(row.meal_periods ?? []),
    ...(row.features ?? []),
    ...(row.activity_categories ?? []),
    ...(row.nightlife_categories ?? []),
    row.neighborhood,
    row.borough,
    row.city,
    row.market,
  ].filter(Boolean).join(" ");
}

function buildQueryTokens(intent: SearchIntentGraph): string[] {
  const explicit = intent.constraints.flatMap((constraint) =>
    tokenize(String(constraint.value)),
  );
  return unique([
    ...tokenize(intent.rawQuery),
    ...explicit,
  ]).filter((token) => !STOP_WORDS.has(token));
}

function matchedQueryTokens(row: LexicalRow, queryTokens: readonly string[]): string[] {
  const document = new Set(tokenize(buildDocument(row)));
  return unique(queryTokens.filter((token) => document.has(token)))
    .map((token) => "token:" + token);
}

function tokenize(value: string): string[] {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function constraintValue(intent: SearchIntentGraph, key: string): string | null {
  const found = intent.constraints.find((constraint) =>
    constraint.key === key && constraint.strength === "hard"
  );
  return found == null ? null : String(found.value);
}

function resolvedGeoConstraint(
  intent: SearchIntentGraph,
): { key: "market" | "city" | "neighborhood" | "borough"; value: string } | null {
  const entityType = intent.anchor?.entityType;
  const resolution = intent.metadata?.entityResolution;
  if (!resolution || typeof resolution !== "object") return null;

  const canonicalName = (resolution as Record<string, unknown>).canonicalName;
  if (typeof canonicalName !== "string" || !canonicalName.trim()) return null;

  if (
    entityType === "market" ||
    entityType === "city" ||
    entityType === "neighborhood" ||
    entityType === "borough"
  ) {
    return { key: entityType, value: canonicalName.trim() };
  }
  return null;
}

function anchorRadiusMiles(intent: SearchIntentGraph): number {
  if (intent.maxTravelMinutes != null) {
    if (intent.travelMode === "walking") {
      return Math.max(0.25, Math.min(3, intent.maxTravelMinutes / 20));
    }
    return Math.max(1, Math.min(15, intent.maxTravelMinutes / 4));
  }
  return intent.travelMode === "walking" ? 1.5 : 3;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
