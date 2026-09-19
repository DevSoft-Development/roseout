import OpenAI from "openai";
import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { normalizePlatforms, type MarketingContentRow } from "@/lib/marketing/content-operations";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const CONTENT_GENERATION_FIELDS = "id,scope,campaign_id,location_id,organization_id,source_type,source_id,title,content_type,occasion,market,neighborhood,budget_category,owner_user_id,status,priority,due_at,publish_at,approval_status,approved_by,approved_at,approved_version,current_version,selected_platforms,media_urls,caption,platform_copy,auto_publish,approval_hash,hook,script,voiceover,cta,metadata,created_by,created_at,updated_at";
const GENERATED_RESPONSE_FIELDS = "id,title,status,selected_platforms,caption,platform_copy,hook,script,voiceover,cta,updated_at";

type PlatformCopy = {
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
};

async function loadGenerationContent(id: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_content_items")
    .select(CONTENT_GENERATION_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Marketing content not found.");
  return data as unknown as MarketingContentRow;
}

function fallback(item: MarketingContentRow) {
  const place = item.neighborhood || item.market || "NYC & Long Island";
  const hook = item.occasion
    ? `${item.occasion}: one plan worth saving in ${place}.`
    : `One ${place} plan worth saving.`;
  const cta = item.cta || "Plan it on TheOutHaven.";
  const caption = `${hook}\n\n${item.title}. ${cta}`;
  return {
    hook,
    script: `${hook}\nShow the location or outing, highlight why it stands out, then close with: ${cta}`,
    voiceover: `${hook} ${item.title}. ${cta}`,
    caption,
    cta,
    platform_copy: {
      instagram: `${caption}\n\nLink in bio.`,
      facebook: caption,
      tiktok: `${hook}\n${cta}\nLink in bio.`,
      youtube: `${item.title}\n\n${caption}`,
    } satisfies PlatformCopy,
  };
}

function normalizeGeneratedPlatformCopy(value: unknown, base: PlatformCopy): PlatformCopy {
  const parsed = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    instagram: typeof parsed.instagram === "string" ? parsed.instagram.slice(0, 5000) : base.instagram,
    facebook: typeof parsed.facebook === "string" ? parsed.facebook.slice(0, 5000) : base.facebook,
    tiktok: typeof parsed.tiktok === "string" ? parsed.tiktok.slice(0, 5000) : base.tiktok,
    youtube: typeof parsed.youtube === "string" ? parsed.youtube.slice(0, 5000) : base.youtube,
  };
}

function generatedText(value: unknown, fallbackValue: string, max = 10000) {
  return typeof value === "string" ? value.trim().slice(0, max) || fallbackValue : fallbackValue;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const item = await loadGenerationContent(id);
    await req.json().catch(() => ({}));
    const base = fallback(item);
    let generated = base;

    if (process.env.OPENAI_API_KEY) {
      const source = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      const prompt = `Create a concise, high-quality social content package for TheOutHaven, an outing-planning platform. Return JSON only with keys hook, script, voiceover, caption, cta, platform_copy. platform_copy must contain instagram, facebook, tiktok, youtube strings.\n\nRules:\n- Never invent venue facts, pricing, event details, or availability.\n- Use only the supplied source context.\n- Instagram and TikTok must use "Link in bio" instead of raw URLs.\n- Keep the hook punchy and useful, not clickbait.\n- Script should be shootable with venue media, screen recordings, maps, B-roll, or voiceover.\n- CTA should encourage planning/saving on TheOutHaven.\n- Facebook can be conversational.\n- YouTube should work as a Short title/description package.\n\nContent title: ${item.title}\nContent type: ${item.content_type}\nOccasion: ${item.occasion || ""}\nMarket/neighborhood: ${item.market || ""} / ${item.neighborhood || ""}\nBudget: ${item.budget_category || ""}\nSelected platforms: ${normalizePlatforms(item.selected_platforms).join(", ")}\nSource type: ${item.source_type || ""}\nSource context: ${JSON.stringify(source).slice(0, 5000)}\nExisting CTA: ${item.cta || ""}`;

      const completion = await openai.chat.completions.create({
        model: process.env.MARKETING_CONTENT_MODEL || "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are TheOutHaven's brand-safe social content producer. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        generated = {
          hook: generatedText(parsed.hook, base.hook, 1000),
          script: generatedText(parsed.script, base.script),
          voiceover: generatedText(parsed.voiceover, base.voiceover),
          caption: generatedText(parsed.caption, base.caption),
          cta: generatedText(parsed.cta, base.cta, 1000),
          platform_copy: normalizeGeneratedPlatformCopy(parsed.platform_copy, base.platform_copy),
        };
      }
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_content_items")
      .update({
        hook: generated.hook,
        script: generated.script,
        voiceover: generated.voiceover,
        caption: generated.caption,
        cta: generated.cta,
        platform_copy: generated.platform_copy,
        status: item.status === "idea" ? "draft" : item.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(GENERATED_RESPONSE_FIELDS)
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data, generated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "AI generation failed." }, { status: 500 });
  }
}
