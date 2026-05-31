import OpenAI from "openai";
import type { SearchIntent } from "./types";
import { deterministicIntentFromQuery, normalizeIntent } from "./normalize-intent";

const DEFAULT_MODEL = "gpt-4.1-mini";

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

function getOpenAIClient() {
  const apiKey = cleanEnvValue(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    return null;
  }

  try {
    return new OpenAI({ apiKey });
  } catch (error) {
    console.error("[enterprise intent parser] failed to create OpenAI client", {
      message: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

function getSearchModel() {
  return cleanEnvValue(process.env.OPENAI_SEARCH_MODEL) || DEFAULT_MODEL;
}

function extractJson(text: string) {
  const trimmed = String(text || "").trim();

  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeLlmIntent(value: unknown) {
  if (!isPlainObject(value)) return null;

  const restaurantIntent = isPlainObject(value.restaurantIntent)
    ? value.restaurantIntent
    : {};

  const activityIntent = isPlainObject(value.activityIntent)
    ? value.activityIntent
    : {};

  const geo = isPlainObject(value.geo) ? value.geo : {};

  const pairingPreference = isPlainObject(value.pairingPreference)
    ? value.pairingPreference
    : {};

  return {
    searchType:
      typeof value.searchType === "string" ? value.searchType : undefined,
    primaryDomain:
      typeof value.primaryDomain === "string" ? value.primaryDomain : undefined,
    needsRestaurant:
      typeof value.needsRestaurant === "boolean"
        ? value.needsRestaurant
        : undefined,
    needsActivity:
      typeof value.needsActivity === "boolean" ? value.needsActivity : undefined,
    wantsPairing:
      typeof value.wantsPairing === "boolean" ? value.wantsPairing : undefined,

    restaurantIntent: {
      mealTerms: safeStringArray(restaurantIntent.mealTerms),
      foodTerms: safeStringArray(restaurantIntent.foodTerms),
      cuisineTerms: safeStringArray(restaurantIntent.cuisineTerms),
      categoryTerms: safeStringArray(restaurantIntent.categoryTerms),
      vibeTerms: safeStringArray(restaurantIntent.vibeTerms),
      featureTerms: safeStringArray(restaurantIntent.featureTerms),
      negativeTerms: safeStringArray(restaurantIntent.negativeTerms),
    },

    activityIntent: {
      activityTerms: safeStringArray(activityIntent.activityTerms),
      categoryTerms: safeStringArray(activityIntent.categoryTerms),
      vibeTerms: safeStringArray(activityIntent.vibeTerms),
      featureTerms: safeStringArray(activityIntent.featureTerms),
      negativeTerms: safeStringArray(activityIntent.negativeTerms),
    },

    geo: {
      raw: typeof geo.raw === "string" ? geo.raw : undefined,
      neighborhood:
        typeof geo.neighborhood === "string" ? geo.neighborhood : undefined,
      city: typeof geo.city === "string" ? geo.city : undefined,
      borough: typeof geo.borough === "string" ? geo.borough : undefined,
      county: typeof geo.county === "string" ? geo.county : undefined,
      region: typeof geo.region === "string" ? geo.region : undefined,
      state: typeof geo.state === "string" ? geo.state : undefined,
    },

    pairingPreference: {
      requiresPairing:
        typeof pairingPreference.requiresPairing === "boolean"
          ? pairingPreference.requiresPairing
          : undefined,
      distanceMode:
        typeof pairingPreference.distanceMode === "string"
          ? pairingPreference.distanceMode
          : undefined,
      maxPairDistanceMiles:
        typeof pairingPreference.maxPairDistanceMiles === "number"
          ? pairingPreference.maxPairDistanceMiles
          : null,
      maxPairWalkingMinutes:
        typeof pairingPreference.maxPairWalkingMinutes === "number"
          ? pairingPreference.maxPairWalkingMinutes
          : null,
      requireWalkablePair:
        typeof pairingPreference.requireWalkablePair === "boolean"
          ? pairingPreference.requireWalkablePair
          : undefined,
    },

    occasion: typeof value.occasion === "string" ? value.occasion : undefined,
    vibe:
      typeof value.vibe === "string"
        ? [value.vibe]
        : Array.isArray(value.vibe)
          ? safeStringArray(value.vibe)
          : undefined,
    budget: typeof value.budget === "string" ? value.budget : undefined,
    timeContext:
      typeof value.timeContext === "string" ? value.timeContext : undefined,
  };
}

function mergeLlmWithBaseline(
  query: string,
  baseline: SearchIntent,
  llmValue: unknown,
): SearchIntent {
  const safeLlm = sanitizeLlmIntent(llmValue);

  if (!safeLlm) {
    return baseline;
  }

  const normalizedLlm = normalizeIntent(query, safeLlm as Partial<SearchIntent>);

  return {
    ...baseline,
    ...normalizedLlm,

    vibe: [
      ...new Set([
        ...(Array.isArray(baseline.vibe) ? baseline.vibe : []),
        ...(Array.isArray(normalizedLlm.vibe)
          ? normalizedLlm.vibe
          : typeof (normalizedLlm as any).vibe === "string"
            ? [(normalizedLlm as any).vibe]
            : []),
      ]),
    ],

    restaurantIntent: {
      ...baseline.restaurantIntent,
      ...normalizedLlm.restaurantIntent,
      mealTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.mealTerms || []),
          ...(normalizedLlm.restaurantIntent?.mealTerms || []),
        ]),
      ],
      foodTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.foodTerms || []),
          ...(normalizedLlm.restaurantIntent?.foodTerms || []),
        ]),
      ],
      cuisineTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.cuisineTerms || []),
          ...(normalizedLlm.restaurantIntent?.cuisineTerms || []),
        ]),
      ],
      categoryTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.categoryTerms || []),
          ...(normalizedLlm.restaurantIntent?.categoryTerms || []),
        ]),
      ],
      vibeTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.vibeTerms || []),
          ...(normalizedLlm.restaurantIntent?.vibeTerms || []),
        ]),
      ],
      featureTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.featureTerms || []),
          ...(normalizedLlm.restaurantIntent?.featureTerms || []),
        ]),
      ],
      negativeTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.negativeTerms || []),
          ...(normalizedLlm.restaurantIntent?.negativeTerms || []),
        ]),
      ],
    },

    activityIntent: {
      ...baseline.activityIntent,
      ...normalizedLlm.activityIntent,
      activityTerms: [
        ...new Set([
          ...(baseline.activityIntent?.activityTerms || []),
          ...(normalizedLlm.activityIntent?.activityTerms || []),
        ]),
      ],
      categoryTerms: [
        ...new Set([
          ...(baseline.activityIntent?.categoryTerms || []),
          ...(normalizedLlm.activityIntent?.categoryTerms || []),
        ]),
      ],
      vibeTerms: [
        ...new Set([
          ...(baseline.activityIntent?.vibeTerms || []),
          ...(normalizedLlm.activityIntent?.vibeTerms || []),
        ]),
      ],
      featureTerms: [
        ...new Set([
          ...(baseline.activityIntent?.featureTerms || []),
          ...(normalizedLlm.activityIntent?.featureTerms || []),
        ]),
      ],
      negativeTerms: [
        ...new Set([
          ...(baseline.activityIntent?.negativeTerms || []),
          ...(normalizedLlm.activityIntent?.negativeTerms || []),
        ]),
      ],
    },

    geo: {
      ...baseline.geo,
      ...normalizedLlm.geo,
      raw: normalizedLlm.geo?.raw || baseline.geo?.raw || null,
      neighborhood:
        normalizedLlm.geo?.neighborhood || baseline.geo?.neighborhood || null,
      city: normalizedLlm.geo?.city || baseline.geo?.city || null,
      borough: normalizedLlm.geo?.borough || baseline.geo?.borough || null,
      county: normalizedLlm.geo?.county || baseline.geo?.county || null,
      region: normalizedLlm.geo?.region || baseline.geo?.region || null,
      state: normalizedLlm.geo?.state || baseline.geo?.state || null,
      latitude: baseline.geo?.latitude ?? normalizedLlm.geo?.latitude ?? null,
      longitude: baseline.geo?.longitude ?? normalizedLlm.geo?.longitude ?? null,
      radiusMiles:
        baseline.geo?.radiusMiles ?? normalizedLlm.geo?.radiusMiles ?? null,
    },

    pairingPreference: {
      requiresPairing:
        normalizedLlm.pairingPreference?.requiresPairing ??
        baseline.pairingPreference?.requiresPairing ??
        false,
      distanceMode:
        normalizedLlm.pairingPreference?.distanceMode ??
        baseline.pairingPreference?.distanceMode ??
        "any",
      maxPairDistanceMiles:
        normalizedLlm.pairingPreference?.maxPairDistanceMiles ??
        baseline.pairingPreference?.maxPairDistanceMiles ??
        null,
      maxPairWalkingMinutes:
        normalizedLlm.pairingPreference?.maxPairWalkingMinutes ??
        baseline.pairingPreference?.maxPairWalkingMinutes ??
        null,
      requireWalkablePair:
        normalizedLlm.pairingPreference?.requireWalkablePair ??
        baseline.pairingPreference?.requireWalkablePair ??
        false,
    },
  };
}

const SYSTEM_PROMPT = `Return JSON only. You classify TheOutHaven local date-night search intent.

TheOutHaven searches restaurants, activities, and paired outings.

Rules:
- Separate restaurant intent from activity intent.
- Do not put food terms in activity intent.
- Do not put activity terms in restaurant intent.
- "after", "before", "then", "with", "near", "nearby", and "walking distance" are relationship words, not search terms.
- "steak dinner" means restaurant only.
- "rooftop dinner" means restaurant only unless another activity is requested.
- "hookah lounge" can be an activity/nightlife venue unless the user asks for food there.
- "bowling", "karaoke", "museum", "comedy show", "arcade", "spa", "paint and sip" are activities.
- If user asks restaurant + activity, set wantsPairing true.
- If user asks walking distance, nearby, close by, same block, no driving, short walk, set pairingPreference.

Pairing preference:
- walking distance/no driving/short walk/same block: distanceMode "walking", maxPairDistanceMiles 0.75, maxPairWalkingMinutes 15, requireWalkablePair true.
- nearby/close by/close together: distanceMode "nearby", maxPairDistanceMiles 1.5, maxPairWalkingMinutes 30, requireWalkablePair true.
- same area/neighborhood: distanceMode "same_area", maxPairDistanceMiles 3, requireWalkablePair false.
- no distance phrase: distanceMode "any", maxPairDistanceMiles null, requireWalkablePair false.

Return this JSON shape:
{
  "searchType": "restaurant" | "activity" | "mixed_outing" | "any",
  "primaryDomain": "restaurant" | "activity" | "mixed" | "any",
  "needsRestaurant": boolean,
  "needsActivity": boolean,
  "wantsPairing": boolean,
  "restaurantIntent": {
    "mealTerms": string[],
    "foodTerms": string[],
    "cuisineTerms": string[],
    "categoryTerms": string[],
    "vibeTerms": string[],
    "featureTerms": string[],
    "negativeTerms": string[]
  },
  "activityIntent": {
    "activityTerms": string[],
    "categoryTerms": string[],
    "vibeTerms": string[],
    "featureTerms": string[],
    "negativeTerms": string[]
  },
  "geo": {
    "raw": string | null,
    "neighborhood": string | null,
    "city": string | null,
    "borough": string | null,
    "county": string | null,
    "region": string | null,
    "state": string | null
  },
  "pairingPreference": {
    "requiresPairing": boolean,
    "distanceMode": "walking" | "nearby" | "same_area" | "any",
    "maxPairDistanceMiles": number | null,
    "maxPairWalkingMinutes": number | null,
    "requireWalkablePair": boolean
  },
  "occasion": string | null,
  "vibe": string | null,
  "budget": string | null,
  "timeContext": string | null
}`;

export async function parseEnterpriseIntent(
  query: string,
  options?: { useLLM?: boolean; body?: unknown },
): Promise<{
  intent: SearchIntent;
  llmIntentRaw: unknown;
  llmError?: string;
}> {
  const baseline = deterministicIntentFromQuery(query);

  if (options?.useLLM === false) {
    return {
      intent: baseline,
      llmIntentRaw: null,
      llmError: "LLM disabled for this request.",
    };
  }

  const openai = getOpenAIClient();

  if (!openai) {
    return {
      intent: baseline,
      llmIntentRaw: null,
      llmError: "OpenAI client unavailable. Using deterministic baseline.",
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: getSearchModel(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? "{}";
    const parsed = extractJson(rawText);

    if (!parsed) {
      return {
        intent: baseline,
        llmIntentRaw: rawText,
        llmError: "LLM returned invalid JSON. Used deterministic baseline.",
      };
    }

    return {
      intent: mergeLlmWithBaseline(query, baseline, parsed),
      llmIntentRaw: parsed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("[enterprise intent parser] LLM failed; search continued with baseline", {
      message,
    });

    return {
      intent: baseline,
      llmIntentRaw: null,
      llmError: message,
    };
  }
}
