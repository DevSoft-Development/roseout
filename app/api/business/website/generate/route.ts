import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import {
  blueprintGeneratedContent,
  blueprintToWebsiteSections,
  buildWebsiteBlueprintPrompt,
  fallbackWebsiteBlueprint,
  normalizeWebsiteBlueprint,
} from "@/lib/websites/blueprint";
import { WEBSITE_AI_IMAGE_GENERATION_ENABLED, WEBSITE_AI_MODEL, estimateWebsiteAiCostMicros } from "@/lib/websites/ai-config";
import { getWebsiteDesignDirection } from "@/lib/websites/design-directions";

export const runtime = "nodejs";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function quotaMessage(message: string) {
  if (message.includes("generation_already_running")) return "Another website AI request is already running for this location.";
  if (message.includes("monthly_cost_limit_reached")) return "This location has reached its monthly website AI budget.";
  if (message.includes("redesign_limit_reached")) return "This location has used its included website redesigns for this month.";
  if (message.includes("initial_build_limit_reached")) return "The included initial AI website build has already been used. Use a redesign instead.";
  return null;
}

async function persistBlueprint(input: {
  websiteId: string;
  blueprint: ReturnType<typeof normalizeWebsiteBlueprint>;
  vision: string;
  existingTheme: Record<string, unknown>;
  existingCustomContent: Record<string, unknown>;
  existingSections: Array<Record<string, unknown>>;
  source: "ai" | "rules";
}) {
  const direction = getWebsiteDesignDirection(input.blueprint.design.directionId);
  const sections = blueprintToWebsiteSections(input.blueprint, input.existingSections as never);
  const theme = {
    ...input.existingTheme,
    ...(direction?.theme || {}),
    design_direction_id: input.blueprint.design.directionId,
    visual_hierarchy: input.blueprint.design.visualHierarchy,
    image_strategy: input.blueprint.design.imageStrategy,
  };
  const customContent = {
    ...input.existingCustomContent,
    design_vision: input.vision,
    blueprint: input.blueprint,
    blueprint_version: 3,
    blueprint_source: input.source,
    generated: blueprintGeneratedContent(input.blueprint),
    cta_strategy: input.blueprint.conversion,
  };

  const { data, error } = await supabaseAdmin
    .from("business_websites")
    .update({
      theme,
      sections,
      custom_content: customContent,
      editor_status: "draft",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.websiteId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  const vision = String(body?.vision || "").trim().slice(0, 1200);
  const requestedMode = body?.mode === "redesign" ? "redesign" : "auto";
  if (!locationId || vision.length < 10) {
    return NextResponse.json({ error: "Add a location and describe the website you want." }, { status: 400 });
  }

  const location = await getAuthorizedWebsiteLocation(user, locationId, "*");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: website, error: websiteError } = await supabaseAdmin
    .from("business_websites")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();
  if (websiteError) return NextResponse.json({ error: "Unable to load the website draft." }, { status: 500 });
  if (!website) return NextResponse.json({ error: "Create the website draft before generating it." }, { status: 409 });

  if (WEBSITE_AI_IMAGE_GENERATION_ENABLED) {
    return NextResponse.json({ error: "Website AI image generation must remain disabled." }, { status: 503 });
  }

  const locationRecord = location as unknown as Record<string, unknown>;
  const metadata = objectValue(locationRecord.metadata);
  const name = firstString(locationRecord, ["name", "restaurant_name", "activity_name", "location_name", "title"]) || "Your business";
  const category = firstString(locationRecord, ["category", "primary_category", "location_type", "type"])
    || firstString(metadata, ["category", "primary_category", "location_type"]);
  const cuisine = firstString(locationRecord, ["cuisine", "cuisine_type"]) || firstString(metadata, ["cuisine", "cuisine_type"]);
  const city = firstString(locationRecord, ["city"]) || firstString(metadata, ["city"]);
  const neighborhood = firstString(locationRecord, ["neighborhood"]) || firstString(metadata, ["neighborhood"]);

  const locationContext = {
    name,
    category,
    cuisine,
    city,
    neighborhood,
    address: firstString(locationRecord, ["address", "formatted_address"]),
    hours: locationRecord.hours ?? metadata.hours ?? null,
    phone: firstString(locationRecord, ["phone", "phone_number"]),
    reservationAvailable: Boolean(firstString(locationRecord, ["reservation_link"]) || metadata.reservation_mode),
    hasRealPhoto: Boolean(firstString(locationRecord, ["image_url", "photo_url"]) || metadata.image_url),
  };

  const existingTheme = objectValue(website.theme);
  const existingCustomContent = objectValue(website.custom_content);
  const existingBlueprint = objectValue(existingCustomContent.blueprint);
  const fallback = fallbackWebsiteBlueprint({
    name,
    category: category || cuisine,
    vision,
    directionId: firstString(existingTheme, ["design_direction_id"]),
  });
  const generationType = requestedMode === "redesign" || Object.keys(existingBlueprint).length > 0 || website.published_version
    ? "full_redesign"
    : "initial_build";

  if (!process.env.OPENAI_API_KEY) {
    const saved = await persistBlueprint({
      websiteId: website.id,
      blueprint: fallback,
      vision,
      existingTheme,
      existingCustomContent,
      existingSections: Array.isArray(website.sections) ? website.sections : [],
      source: "rules",
    });
    return NextResponse.json({ ok: true, website: saved, blueprint: fallback, source: "rules", generation_type: generationType });
  }

  const estimatedCostMicros = estimateWebsiteAiCostMicros(5000, 2200);
  const requestKey = `website_v3:${locationId}:${randomUUID()}`;
  const { data: usageId, error: beginError } = await supabaseAdmin.rpc("begin_location_website_ai_generation", {
    p_location_id: locationId,
    p_generation_type: generationType,
    p_provider: "openai",
    p_model: WEBSITE_AI_MODEL,
    p_request_key: requestKey,
    p_estimated_cost_micros: estimatedCostMicros,
  });
  if (beginError || !usageId) {
    const friendly = quotaMessage(String(beginError?.message || ""));
    if (friendly) return NextResponse.json({ error: friendly }, { status: 429 });
    console.error("Website V3 quota guard unavailable", beginError);
    return NextResponse.json({ error: "Website AI generation is temporarily unavailable." }, { status: 503 });
  }

  try {
    const prompt = buildWebsiteBlueprintPrompt({ vision, location: locationContext, fallback });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: WEBSITE_AI_MODEL,
      temperature: 0.2,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const blueprint = normalizeWebsiteBlueprint(parsed, fallback);
    const saved = await persistBlueprint({
      websiteId: website.id,
      blueprint,
      vision,
      existingTheme,
      existingCustomContent,
      existingSections: Array.isArray(website.sections) ? website.sections : [],
      source: "ai",
    });
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    await supabaseAdmin.rpc("finish_location_website_ai_generation", {
      p_usage_id: usageId,
      p_status: "succeeded",
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_actual_cost_micros: estimateWebsiteAiCostMicros(inputTokens, outputTokens),
      p_error_code: null,
    });
    return NextResponse.json({
      ok: true,
      website: saved,
      blueprint,
      source: "ai",
      generation_type: generationType,
      model: WEBSITE_AI_MODEL,
    });
  } catch (error) {
    await supabaseAdmin.rpc("finish_location_website_ai_generation", {
      p_usage_id: usageId,
      p_status: "failed",
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_actual_cost_micros: 0,
      p_error_code: "website_v3_generation_failed",
    });
    console.error("Website V3 generation failed", error);
    return NextResponse.json({ error: "We could not generate the website right now. Your existing draft was not changed." }, { status: 502 });
  }
}
