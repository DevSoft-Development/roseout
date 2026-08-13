import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getWebsiteDesignDirection } from "@/lib/websites/design-directions";

export const runtime = "nodejs";

type GenerationType = "initial_build" | "full_redesign";

type GeneratedSite = {
  hero: { heading: string; subheading: string; ctaLabel: string };
  about: { heading: string; body: string };
  seo: { title: string; description: string };
  sectionOrder: string[];
  sectionEmphasis: Record<string, "low" | "normal" | "high">;
};

function sanitizeGeneratedSite(input: unknown): GeneratedSite | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, any>;
  const hero = value.hero || {};
  const about = value.about || {};
  const seo = value.seo || {};
  const sectionOrder = Array.isArray(value.sectionOrder) ? value.sectionOrder.filter((item: unknown) => typeof item === "string").slice(0, 12) : [];
  if (!hero.heading || !hero.subheading || !about.body || !seo.title || !seo.description) return null;
  return {
    hero: {
      heading: String(hero.heading).slice(0, 120),
      subheading: String(hero.subheading).slice(0, 260),
      ctaLabel: String(hero.ctaLabel || "Plan your visit").slice(0, 60),
    },
    about: { heading: String(about.heading || "About").slice(0, 100), body: String(about.body).slice(0, 1200) },
    seo: { title: String(seo.title).slice(0, 70), description: String(seo.description).slice(0, 170) },
    sectionOrder,
    sectionEmphasis: value.sectionEmphasis && typeof value.sectionEmphasis === "object" ? value.sectionEmphasis : {},
  };
}

async function ownedLocation(user: { id: string; email?: string | null }, locationId: string) {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,name,title,location_type,category,primary_category,cuisine,neighborhood,city")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();
  return data || null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  const generationType: GenerationType = body?.generation_type === "full_redesign" ? "full_redesign" : "initial_build";
  const requestKey = String(body?.request_key || crypto.randomUUID()).slice(0, 160);
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const location = await ownedLocation(user, locationId);
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: website } = await supabaseAdmin.from("location_websites").select("*").eq("location_id", locationId).maybeSingle();
  if (!website) return NextResponse.json({ error: "Choose and save a Design Direction first." }, { status: 409 });

  const directionId = String((website.theme as any)?.design_direction_id || "");
  const direction = getWebsiteDesignDirection(directionId);
  if (!direction) return NextResponse.json({ error: "Choose and save a Design Direction first." }, { status: 409 });

  const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "ai_website_builder_policy").maybeSingle();
  const policy = (setting?.value || {}) as Record<string, any>;
  if (policy.aiImageGenerationEnabled !== false) return NextResponse.json({ error: "Website AI generation is temporarily unavailable." }, { status: 503 });

  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usage } = await supabaseAdmin
    .from("location_website_ai_usage")
    .select("generation_type,status,estimated_cost_micros,started_at")
    .eq("location_id", locationId)
    .gte("started_at", monthStart.toISOString());

  const rows = usage || [];
  const running = rows.some((row) => row.status === "running");
  if (running) return NextResponse.json({ error: "A website generation is already running." }, { status: 409 });

  const initialUsed = rows.filter((row) => row.generation_type === "initial_build" && ["running", "succeeded"].includes(row.status)).length;
  const redesignUsed = rows.filter((row) => row.generation_type === "full_redesign" && ["running", "succeeded"].includes(row.status)).length;
  const monthCost = rows.filter((row) => row.status === "succeeded").reduce((sum, row) => sum + Number(row.estimated_cost_micros || 0), 0);
  if (generationType === "initial_build" && initialUsed >= Number(policy.initialBuildsIncluded ?? 1)) return NextResponse.json({ error: "Your included initial website build has already been used." }, { status: 409 });
  if (generationType === "full_redesign" && redesignUsed >= Number(policy.fullRedesignsPerMonth ?? 2)) return NextResponse.json({ error: "You have used your full redesigns for this month." }, { status: 429 });
  if (monthCost >= Number(policy.maxEstimatedCostMicrosPerLocationMonth ?? 5000000)) return NextResponse.json({ error: "Website AI generation is temporarily unavailable for this location." }, { status: 429 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Website AI generation is not configured." }, { status: 503 });

  const model = "gpt-4o-mini";
  const { data: usageRow, error: usageError } = await supabaseAdmin.from("location_website_ai_usage").insert({
    website_id: website.id,
    location_id: locationId,
    generation_type: generationType,
    status: "running",
    model,
    request_key: requestKey,
  }).select("id").single();
  if (usageError || !usageRow) return NextResponse.json({ error: "A website generation is already running or this request was already processed." }, { status: 409 });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `Create concise website editorial copy and presentation decisions for a real business. Design Direction: ${direction.name} — ${direction.summary}. Return JSON only with hero {heading, subheading, ctaLabel}, about {heading, body}, seo {title, description}, sectionOrder, sectionEmphasis. Never invent addresses, hours, prices, menu items, phone numbers, reservation links, awards, ratings, amenities, availability, or other business facts. Those are live-bound separately. Do not generate or request images.` },
        { role: "user", content: JSON.stringify({ businessName: location.name || location.title, locationType: location.location_type, category: location.primary_category || location.category, cuisine: location.cuisine, neighborhood: location.neighborhood, city: location.city, designVision: (website.custom_content as any)?.design_vision || "", availableSections: Array.isArray(website.sections) ? website.sections.map((section: any) => section.id) : [] }) },
      ],
    });

    const generated = sanitizeGeneratedSite(JSON.parse(completion.choices[0]?.message?.content || "{}"));
    if (!generated) throw new Error("invalid_generated_site");

    const nextCustomContent = { ...(website.custom_content || {}), generated };
    const nextSections = Array.isArray(website.sections) ? website.sections.map((section: any) => ({ ...section, emphasis: generated.sectionEmphasis?.[section.id] || "normal" })) : [];
    const snapshot = { theme: website.theme, sections: nextSections, custom_content: nextCustomContent };
    const { data: versionRow } = await supabaseAdmin.from("location_website_versions").select("version").eq("website_id", website.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = Number(versionRow?.version || 0) + 1;

    const { error: versionError } = await supabaseAdmin.from("location_website_versions").insert({ website_id: website.id, version: nextVersion, snapshot, source: "ai", created_by: user.id });
    if (versionError) throw versionError;

    const { error: websiteError } = await supabaseAdmin.from("location_websites").update({ custom_content: nextCustomContent, sections: nextSections, status: "ready", updated_at: new Date().toISOString() }).eq("id", website.id);
    if (websiteError) throw websiteError;

    await supabaseAdmin.from("location_website_ai_usage").update({
      status: "succeeded",
      input_tokens: completion.usage?.prompt_tokens || 0,
      output_tokens: completion.usage?.completion_tokens || 0,
      estimated_cost_micros: 0,
      completed_at: new Date().toISOString(),
    }).eq("id", usageRow.id);

    return NextResponse.json({ ok: true, website_id: website.id, version: nextVersion, generated });
  } catch (error) {
    console.error("Website generation failed", error);
    await supabaseAdmin.from("location_website_ai_usage").update({ status: "failed", error_code: "generation_failed", completed_at: new Date().toISOString() }).eq("id", usageRow.id);
    return NextResponse.json({ error: "We could not generate the website. Your redesign allowance was not consumed." }, { status: 500 });
  }
}
