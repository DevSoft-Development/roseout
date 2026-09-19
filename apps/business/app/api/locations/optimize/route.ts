import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { getAiTagHelperSettings } from "@/lib/ai-tag-helper-settings";
import { PRICE_RANGE_OPTIONS } from "@/lib/location-profile-fields";
import { isBusinessPro } from "@/lib/analytics/business-analytics";

export const runtime = "nodejs";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FREE_AI_TAG_LIMIT = 3;

function tags(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}
function cleanPriceRange(value: unknown) {
  const candidate = String(value ?? "").trim();
  return PRICE_RANGE_OPTIONS.some((option) => option.value === candidate) ? candidate : "";
}

async function authFor(body: any) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized", isAdmin: false };

  const isAdmin = Boolean(await getAdminLoginRole(supabaseAdmin as any, { id: user.id, email: user.email ?? null }));
  const settings = await getAiTagHelperSettings();
  if (settings.access === "off") return { ok: false as const, status: 403, error: "AI Tag Helper is turned off.", isAdmin };
  if (!isAdmin && settings.access === "admins_only") return { ok: false as const, status: 403, error: "AI Tag Helper is limited to admins.", isAdmin };

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: body.id ?? body.location_id,
    adminLocationId: body.adminLocationId,
    demoLocationId: body.demoLocationId,
    sourceId: body.sourceId,
    type: body.type ?? body.table,
    demo: toBoolean(body.demo),
    fromDemoCenter: toBoolean(body.fromDemoCenter),
    allowDemoPreview: true,
    permission: "recommendations.apply",
  });

  if (guard.error) return { ok: false as const, status: guard.error.status, error: "You do not have access to this location.", isAdmin };
  const paid = isAdmin || isBusinessPro(guard.access.location || {});

  if (settings.access === "paid_only" && !paid && body.mode !== "discovery_tags") {
    return { ok: false as const, status: 403, error: "AI Tag Helper is limited to paid locations.", isAdmin };
  }

  return { ok: true as const, isAdmin: guard.access.isAdmin, settings, location: guard.access.location, paid };
}

async function getFreeUsage(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_ai_tag_suggestion_usage")
    .select("suggestions_used")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) {
    console.warn("AI tag usage lookup unavailable", error.message);
    return 0;
  }
  return Math.max(0, Number(data?.suggestions_used || 0));
}

async function recordFreeUsage(locationId: string, count: number, previous: number) {
  if (count <= 0) return;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    location_id: locationId,
    suggestions_used: previous + count,
    last_used_at: now,
    updated_at: now,
  };
  if (previous === 0) row.first_used_at = now;
  const { error } = await supabaseAdmin.from("location_ai_tag_suggestion_usage").upsert(row, { onConflict: "location_id" });
  if (error) console.warn("AI tag usage record unavailable", error.message);
}

async function discoverySuggestions(body: any, gate: Extract<Awaited<ReturnType<typeof authFor>>, { ok: true }>) {
  const location = gate.location || {};
  const locationId = String(location.id || body.location_id || body.id || "");
  const used = gate.paid ? 0 : await getFreeUsage(locationId);
  const remaining = gate.paid ? null : Math.max(0, FREE_AI_TAG_LIMIT - used);

  if (!gate.paid && remaining === 0) {
    return NextResponse.json({
      error: "You used all 3 free AI tag suggestions. Upgrade your account to unlock ongoing AI recommendations.",
      ai_access: { paid: false, limit: FREE_AI_TAG_LIMIT, used, remaining: 0, upgrade_required: true },
    }, { status: 403 });
  }

  const input = {
    name: location.name || location.restaurant_name || location.activity_name || body.name,
    description: location.description || body.description,
    short_description: location.short_description || body.short_description,
    category: location.category || location.primary_category || body.category,
    primary_category: location.primary_category || body.primary_category,
    cuisine: location.cuisine || location.cuisine_type || body.cuisine,
    activity_type: location.activity_type || body.activity_type,
    city: location.city || body.city,
    neighborhood: location.neighborhood || body.neighborhood,
    vibe_tags: unique([...tags(location.vibe_tags), ...tags(body.vibe_tags)]),
    best_for_tags: unique([...tags(location.best_for_tags || location.best_for), ...tags(body.best_for_tags)]),
    date_style_tags: unique([...tags(location.date_style_tags), ...tags(body.date_style_tags)]),
    special_features: unique([...tags(location.special_features), ...tags(body.special_features)]),
    search_keywords: unique([...tags(location.search_keywords), ...tags(body.search_keywords)]),
    semantic_tags: unique([...tags(location.semantic_tags), ...tags(body.semantic_tags)]),
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You suggest safe discovery tags for TheOutHaven locations. Return only valid JSON. Never invent factual amenities, schedules, policies, ratings, events, or features that are not supported by the supplied profile. Prefer short natural-language phrases a guest might search. Avoid duplicates and generic filler.",
      },
      {
        role: "user",
        content: `Suggest discovery metadata using only the supplied location profile. Return: vibe_tags, best_for_tags, date_style_tags, special_features, search_keywords, semantic_tags. Vibe examples: romantic, cozy, lively, intimate. Best-for examples: date night, birthday, groups, anniversary. Date-style examples: casual date, adventurous date, creative date. Special features must only be returned when supported by the input. Search keywords should be natural phrases. Semantic tags should consolidate the strongest discovery concepts.\n\nInput JSON:\n${JSON.stringify(input)}\n\nReturn shape: {"suggestions":{"vibe_tags":[],"best_for_tags":[],"date_style_tags":[],"special_features":[],"search_keywords":[],"semantic_tags":[]},"confidence":"high|medium|low","reason":"..."}`,
      },
    ],
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const raw = parsed.suggestions || {};
  const buckets = {
    vibe_tags: unique(tags(raw.vibe_tags)).slice(0, 8),
    best_for_tags: unique(tags(raw.best_for_tags)).slice(0, 8),
    date_style_tags: unique(tags(raw.date_style_tags)).slice(0, 8),
    special_features: unique(tags(raw.special_features)).slice(0, 8),
    search_keywords: unique(tags(raw.search_keywords)).slice(0, 8),
    semantic_tags: unique(tags(raw.semantic_tags)).slice(0, 12),
  };

  if (gate.paid) {
    return NextResponse.json({
      suggestions: buckets,
      confidence: parsed.confidence || "medium",
      reason: parsed.reason || "Based on the available profile data.",
      ai_access: { paid: true, limit: null, used: null, remaining: null, upgrade_required: false },
    });
  }

  const flattened = unique([
    ...buckets.vibe_tags,
    ...buckets.best_for_tags,
    ...buckets.date_style_tags,
    ...buckets.special_features,
    ...buckets.search_keywords,
    ...buckets.semantic_tags,
  ]).slice(0, remaining || FREE_AI_TAG_LIMIT);
  await recordFreeUsage(locationId, flattened.length, used);
  const nextUsed = used + flattened.length;

  return NextResponse.json({
    suggestions: { vibe_tags: [], best_for_tags: [], date_style_tags: [], special_features: [], search_keywords: flattened, semantic_tags: flattened },
    confidence: parsed.confidence || "medium",
    reason: parsed.reason || "Based on the available profile data.",
    ai_access: {
      paid: false,
      limit: FREE_AI_TAG_LIMIT,
      used: nextUsed,
      remaining: Math.max(0, FREE_AI_TAG_LIMIT - nextUsed),
      upgrade_required: nextUsed >= FREE_AI_TAG_LIMIT,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const gate = await authFor(body);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });

    if (body.mode === "discovery_tags") return discoverySuggestions(body, gate);

    const input = {
      id: body.id ?? body.location_id ?? null,
      type: body.type ?? body.table ?? null,
      name: body.name,
      description: body.description,
      category: body.category,
      primary_category: body.primary_category,
      cuisine: body.cuisine,
      primary_tag: body.primary_tag,
      semantic_tags: tags(body.semantic_tags),
      best_for_tags: tags(body.best_for_tags),
      best_for: tags(body.best_for),
      price_range: body.price_range,
      city: body.city,
      neighborhood: body.neighborhood,
      location_type: body.location_type,
    };
    const allowedPriceRanges = PRICE_RANGE_OPTIONS.map((option) => option.value);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 650,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You suggest draft TheOutHaven location profile fields. Return only valid JSON. Do not invent hard factual claims, amenities, policies, hours, ratings, or review claims. Do not generate review_keywords. Suggestions do not overwrite existing data and must be reviewed before saving." },
        { role: "user", content: `Based only on the available name, existing description, category, cuisine, price, location type, city, neighborhood, and current tags, suggest every editable field in Profile Basics and Search & Matching: Description, Primary Tag, Cuisine, Price Range, Search Boost Tags, and Best For Tags. Keep the description factual, concise, customer-friendly, and useful for search. Keep tags short and search-friendly. Use semantic_tags as Search Boost Tags. Price Range must be exactly one of ${JSON.stringify(allowedPriceRanges)}; return an empty string when evidence is insufficient. Do not return date_style_tags, special_features, search_keywords, intent_tags, vibe_tags, or review_keywords.\n\nInput JSON:\n${JSON.stringify(input)}\n\nReturn shape: {"suggestions":{"description":"Concise factual profile description","primary_tag":"Mediterranean restaurant","cuisine":"Mediterranean","price_range":"$$","semantic_tags":["hookah","shisha"],"best_for_tags":["date night"]},"confidence":"high|medium|low","reason":"Based on the available profile data."}` },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const suggestions = parsed.suggestions || {};
    return NextResponse.json({
      suggestions: {
        description: String(suggestions.description ?? "").trim().slice(0, 1200),
        primary_tag: String(suggestions.primary_tag ?? "").trim(),
        cuisine: String(suggestions.cuisine ?? "").trim(),
        price_range: cleanPriceRange(suggestions.price_range),
        semantic_tags: tags(suggestions.semantic_tags).slice(0, 8),
        best_for_tags: tags(suggestions.best_for_tags).slice(0, 8),
      },
      confidence: parsed.confidence || "medium",
      reason: parsed.reason || "Based on the available profile data.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Optimization failed." }, { status: 500 });
  }
}
