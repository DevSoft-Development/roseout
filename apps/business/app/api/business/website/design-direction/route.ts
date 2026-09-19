import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";
import { buildDesignDirectionPrompt, fallbackDesignMatches, normalizeDesignMatches } from "@/lib/websites/design-direction-matcher";
import {
  WEBSITE_AI_IMAGE_GENERATION_ENABLED,
  WEBSITE_AI_MODEL,
  estimateWebsiteAiCostMicros,
} from "@/lib/websites/ai-config";

export const runtime = "nodejs";

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function quotaErrorMessage(message: string) {
  if (message.includes("generation_already_running")) return "Another website AI request is already running for this location.";
  if (message.includes("monthly_cost_limit_reached")) return "This location has reached its monthly website AI budget.";
  if (message.includes("redesign_limit_reached")) return "This location has used its full redesigns for this month.";
  if (message.includes("initial_build_limit_reached")) return "The included initial website build has already been used.";
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  const vision = String(body?.vision || "").trim().slice(0, 1200);
  if (!locationId || vision.length < 10) return NextResponse.json({ error: "Add a location and describe the website direction you want." }, { status: 400 });

  const location = await getAuthorizedWebsiteLocation(user, locationId, "*");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const locationRecord = location as Record<string, unknown>;
  const metadata = locationRecord.metadata && typeof locationRecord.metadata === "object" && !Array.isArray(locationRecord.metadata)
    ? locationRecord.metadata as Record<string, unknown>
    : {};

  const locationContext: Record<string, unknown> = {
    id: locationId,
    name: firstString(locationRecord, ["name", "restaurant_name", "activity_name", "location_name", "title"]),
    location_type: firstString(locationRecord, ["location_type", "type", "primary_category"]),
    category: firstString(locationRecord, ["category", "primary_category"]) || firstString(metadata, ["category", "primary_category"]),
    cuisine: firstString(locationRecord, ["cuisine", "cuisine_type"]) || firstString(metadata, ["cuisine", "cuisine_type"]),
    neighborhood: firstString(locationRecord, ["neighborhood"]) || firstString(metadata, ["neighborhood"]),
    city: firstString(locationRecord, ["city"]) || firstString(metadata, ["city"]),
  };

  const fallback = fallbackDesignMatches(vision);
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: true, matches: fallback, source: "rules" });

  // This product never generates AI imagery. Keep the invariant explicit so a
  // future config change cannot silently turn image generation on.
  if (WEBSITE_AI_IMAGE_GENERATION_ENABLED) {
    return NextResponse.json({ error: "Website AI image generation must remain disabled." }, { status: 503 });
  }

  const requestKey = `design_match:${locationId}:${randomUUID()}`;
  const estimatedCostMicros = estimateWebsiteAiCostMicros();
  const { data: usageId, error: beginError } = await supabaseAdmin.rpc("begin_location_website_ai_generation", {
    p_location_id: locationId,
    p_generation_type: "design_match",
    p_provider: "openai",
    p_model: WEBSITE_AI_MODEL,
    p_request_key: requestKey,
    p_estimated_cost_micros: estimatedCostMicros,
  });

  if (beginError || !usageId) {
    const message = String(beginError?.message || "");
    const friendly = quotaErrorMessage(message);
    if (friendly) return NextResponse.json({ error: friendly }, { status: 429 });
    console.error("Website AI quota guard unavailable; using deterministic style matcher", beginError);
    return NextResponse.json({ ok: true, matches: fallback, source: "rules_guardrail" });
  }

  try {
    const prompt = buildDesignDirectionPrompt(vision, locationContext);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: WEBSITE_AI_MODEL,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const matches = normalizeDesignMatches(parsed);
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    const actualCostMicros = estimateWebsiteAiCostMicros(inputTokens, outputTokens);

    await supabaseAdmin.rpc("finish_location_website_ai_generation", {
      p_usage_id: usageId,
      p_status: "succeeded",
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_actual_cost_micros: actualCostMicros,
      p_error_code: null,
    });

    return NextResponse.json({
      ok: true,
      matches: matches.length ? matches : fallback,
      source: matches.length ? "ai" : "rules",
      model: WEBSITE_AI_MODEL,
    });
  } catch (error) {
    await supabaseAdmin.rpc("finish_location_website_ai_generation", {
      p_usage_id: usageId,
      p_status: "failed",
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_actual_cost_micros: 0,
      p_error_code: "design_match_failed",
    });
    console.error("Website design direction match failed", error);
    return NextResponse.json({ ok: true, matches: fallback, source: "rules" });
  }
}
