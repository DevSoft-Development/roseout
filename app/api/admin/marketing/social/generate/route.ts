import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { locationUrl, normalizeString, requireMarketingAdminApi } from "@/lib/marketing-admin";
import {
  buildMarketingSocialPackage,
  captionCategories,
  type MarketingSocialPackage,
} from "@/lib/marketing/caption-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function fallbackGeneration(input: Record<string, unknown>, ctaUrl: string) {
  return buildMarketingSocialPackage({
    locationName: normalizeString(input.location_name, "this TheOutHaven spot"),
    category: normalizeString(input.location_category, "outing"),
    city: normalizeString(input.location_city, "NYC"),
    state: normalizeString(input.location_state),
    address: normalizeString(input.location_address),
    description: normalizeString(input.location_description),
    fullUrl: ctaUrl,
    captionCategory: normalizeString(input.caption_category),
  });
}

function socialCaption(text: string, linkInBioCta: string) {
  const caption = text.replace(/((?:https?:\/\/|www\.)\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi, "Link in bio").trim();
  return /link in bio/i.test(caption) ? caption : `${caption}\n\n${linkInBioCta}`;
}

function mergeGeneration(base: MarketingSocialPackage, generated: Partial<MarketingSocialPackage>) {
  const merged = { ...base, ...generated };
  const captionCategory = captionCategories.includes(merged.caption_category) ? merged.caption_category : base.caption_category;
  const linkInBioCta = merged.link_in_bio_cta || base.link_in_bio_cta;

  return {
    instagram_caption: socialCaption(merged.instagram_caption || base.instagram_caption, linkInBioCta),
    tiktok_caption: socialCaption(merged.tiktok_caption || base.tiktok_caption, linkInBioCta),
    youtube_title: merged.youtube_title || base.youtube_title,
    youtube_description: merged.youtube_description || base.youtube_description,
    email_subject: merged.email_subject || base.email_subject,
    email_body: merged.email_body || base.email_body,
    sms_body: merged.sms_body || base.sms_body,
    caption_category: captionCategory,
    hook: merged.hook || base.hook,
    link_in_bio_cta: linkInBioCta,
    short_link: merged.short_link || base.short_link,
    full_url: merged.full_url || base.full_url,
  } satisfies MarketingSocialPackage;
}

export async function POST(req: Request) {
  const { error } = await requireMarketingAdminApi();
  if (error) return error;

  const body = await req.json();
  const campaignId = normalizeString(body.campaign_id);
  const ctaUrl = normalizeString(body.cta_url) || locationUrl(body.location_source_type, body.location_source_id, body.public_location_url);

  const baseGeneration = fallbackGeneration(body, ctaUrl);
  let generated: MarketingSocialPackage = baseGeneration;

  if (process.env.OPENAI_API_KEY) {
    const prompt = `Create a viral but brand-safe marketing package for TheOutHaven. Return only JSON with exactly these keys: instagram_caption, tiktok_caption, youtube_title, youtube_description, email_subject, email_body, sms_body, caption_category, hook, link_in_bio_cta, short_link, full_url.
Rules:
- Instagram and TikTok captions must not contain raw URLs and must use "Link in bio".
- YouTube description must include the full URL.
- Email body must include the full clickable URL.
- SMS body must use the short branded link.
- Caption category must be one of: ${captionCategories.join(", ")}.
Location name: ${normalizeString(body.location_name)}
Category: ${normalizeString(body.location_category)}
City/state: ${normalizeString(body.location_city)}, ${normalizeString(body.location_state)}
Address: ${normalizeString(body.location_address)}
Description: ${normalizeString(body.location_description)}
Preferred caption category: ${normalizeString(body.caption_category, baseGeneration.caption_category)}
CTA URL: ${ctaUrl}
Short branded link: ${baseGeneration.short_link}
Campaign goal: ${normalizeString(body.goal, "Drive clicks, saves, and planned nights out")}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You create compliant restaurant/activity social promo copy. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) generated = mergeGeneration(baseGeneration, JSON.parse(content));
  }

  if (campaignId) {
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({
        social_captions: {
          instagram: generated.instagram_caption,
          tiktok: generated.tiktok_caption,
          youtube: generated.youtube_description,
          youtube_shorts: generated.youtube_description,
        },
        hashtags: [],
        generated_payload: generated,
        cta_url: ctaUrl,
        email_subject: generated.email_subject,
        sms_text: generated.sms_body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
  }

  return NextResponse.json(generated);
}
