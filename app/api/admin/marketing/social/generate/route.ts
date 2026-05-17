import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { locationUrl, normalizeString, requireMarketingAdminApi } from "@/lib/marketing-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function fallbackGeneration(input: Record<string, unknown>) {
  const locationName = normalizeString(input.location_name, "this TheOutHaven spot");
  const city = normalizeString(input.location_city);
  const state = normalizeString(input.location_state);
  const category = normalizeString(input.location_category, "outing");
  const place = [city, state].filter(Boolean).join(", ");
  const cta = `Plan your next outing at ${locationName}`;

  return {
    instagram_caption: `${locationName} is ready for your next ${category.toLowerCase()} moment${place ? ` in ${place}` : ""}. Save this for your next TheOutHaven plan.`,
    tiktok_caption: `POV: you found ${locationName} for your next outing ✨`,
    youtube_shorts_title: `${locationName}: TheOutHaven Pick`,
    youtube_shorts_description: `A quick look at ${locationName}${place ? ` in ${place}` : ""}.`,
    hashtags: ["TheOutHaven", "DateNight", "LocalFinds", category.replace(/\s+/g, "")].filter(Boolean),
    voiceover_script: `Looking for somewhere memorable? ${locationName} brings the vibe, the location, and an easy reason to get out.` ,
    cta,
    location_promo_text: `${locationName}${place ? ` in ${place}` : ""} is a featured TheOutHaven option for your next plan.`,
    image_suggestions: ["Hero shot of the space", "Close-up of the signature experience", "People enjoying the atmosphere"],
    video_suggestions: ["5-second exterior intro", "Atmosphere pan", "CTA end card with location name"],
  };
}

export async function POST(req: Request) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const campaignId = normalizeString(body.campaign_id);
  const ctaUrl = normalizeString(body.cta_url) || locationUrl(body.location_source_type, body.location_source_id, body.public_location_url);

  let generated = fallbackGeneration(body);

  if (process.env.OPENAI_API_KEY) {
    const prompt = `Create a safe, concise marketing package for TheOutHaven. Return only JSON with keys: instagram_caption, tiktok_caption, youtube_shorts_title, youtube_shorts_description, hashtags array, voiceover_script, cta, location_promo_text, image_suggestions array, video_suggestions array.
Location name: ${normalizeString(body.location_name)}
Category: ${normalizeString(body.location_category)}
City/state: ${normalizeString(body.location_city)}, ${normalizeString(body.location_state)}
Address: ${normalizeString(body.location_address)}
Description: ${normalizeString(body.location_description)}
CTA URL: ${ctaUrl}
Campaign goal: ${normalizeString(body.goal, "Drive clicks and saved plans")}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 650,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You create compliant restaurant/activity social promo copy. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) generated = JSON.parse(content);
  }

  if (campaignId) {
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({
        social_captions: {
          instagram: generated.instagram_caption,
          tiktok: generated.tiktok_caption,
          youtube_shorts: generated.youtube_shorts_description,
        },
        hashtags: generated.hashtags || [],
        generated_payload: generated,
        cta_url: ctaUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
  }

  return NextResponse.json({ generated, cta_url: ctaUrl });
}
