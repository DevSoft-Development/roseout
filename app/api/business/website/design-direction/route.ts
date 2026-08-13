import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildDesignDirectionPrompt, fallbackDesignMatches, normalizeDesignMatches } from "@/lib/websites/design-direction-matcher";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  const vision = String(body?.vision || "").trim().slice(0, 1200);
  if (!locationId || vision.length < 10) return NextResponse.json({ error: "Add a location and describe the website direction you want." }, { status: 400 });

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,title,location_type,category,primary_category,cuisine,neighborhood,city")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const fallback = fallbackDesignMatches(vision);
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: true, matches: fallback, source: "rules" });

  const { data: policyRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", "ai_website_builder_policy").maybeSingle();
  const policy = policyRow?.value && typeof policyRow.value === "object" && !Array.isArray(policyRow.value) ? policyRow.value as Record<string, unknown> : {};
  if (policy.aiImageGenerationEnabled === true) {
    return NextResponse.json({ error: "Website AI policy is misconfigured." }, { status: 503 });
  }

  const { data: website } = await supabaseAdmin.from("business_websites").select("id").eq("location_id", locationId).maybeSingle();
  let usageId: string | null = null;
  if (website?.id) {
    const { data: usage } = await supabaseAdmin.from("business_website_ai_usage").insert({
      website_id: website.id,
      location_id: locationId,
      generation_type: "design_match",
      status: "running",
      provider: "openai",
      model: "gpt-4o-mini",
    }).select("id").single();
    usageId = usage?.id || null;
  }

  try {
    const prompt = buildDesignDirectionPrompt(vision, location);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 350,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const matches = normalizeDesignMatches(parsed);
    if (usageId) await supabaseAdmin.from("business_website_ai_usage").update({
      status: "succeeded",
      input_tokens: completion.usage?.prompt_tokens || 0,
      output_tokens: completion.usage?.completion_tokens || 0,
      completed_at: new Date().toISOString(),
    }).eq("id", usageId).eq("status", "running");
    return NextResponse.json({ ok: true, matches: matches.length ? matches : fallback, source: matches.length ? "ai" : "rules" });
  } catch (error) {
    if (usageId) await supabaseAdmin.from("business_website_ai_usage").update({ status: "failed", error_code: "design_match_failed", completed_at: new Date().toISOString() }).eq("id", usageId).eq("status", "running");
    console.error("Website design direction match failed", error);
    return NextResponse.json({ ok: true, matches: fallback, source: "rules" });
  }
}
