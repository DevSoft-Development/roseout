import OpenAI from "openai";
import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { loadMarketingContent, normalizePlatforms } from "@/lib/marketing/content-operations";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type PlatformCopy = {
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
};

function fallback(item: Awaited<ReturnType<typeof loadMarketingContent>>) {
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
    instagram: typeof parsed.instagram === "string" ? parsed.instagram : base.instagram,
    facebook: typeof parsed.facebook === "string" ? parsed.facebook : base.facebook,
    tiktok: typeof parsed.tiktok === "string" ? parsed.tiktok : base.tiktok,
    youtube: typeof parsed.youtube === "string" ? parsed.youtube : base.youtube,
  };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingEdit);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const item = await loadMarketingContent(id);
    await req.json().catch(() => ({}));
    const base = fallback(item);
    let generated = base;

    if (process.env.OPENAI_API_KEY) {
      const source = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      const prompt = `Create a concise, high-quality social content package for TheOutHaven, an outing-planning platform. Return JSON only with keys hook, script, voiceover, caption, cta, platform_copy. platform_copy must contain instagram, facebook, tiktok, youtube strings.

Rules:
- Never invent venue facts, pricing, event details, or availability.
- Use only the supplied source context.
- Instagram and TikTok must use "Link in bio" instead of raw URLs.
- Keep the hook punchy and useful, not clickbait.
- Script should be shootable with venue media, screen recordings, maps, B-roll, or voiceover.
- CTA should encourage planning/saving on TheOutHaven.
- Facebook can be conversational.
- YouTube should work as a Short title/description package.

Content title: ${item.title}
Content type: ${item.content_type}
Occasion: ${item.occasion || ""}
Market/neighborhood: ${item.market || ""} / ${item.neighborhood || ""}
Budget: ${item.budget_category || ""}
Selected platforms: ${normalizePlatforms(item.selected_platforms).join(", ")}
Source type: ${item.source_type || ""}
Source context: ${JSON.stringify(source).slice(0, 5000)}
Existing CTA: ${item.cta || ""}`;

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
          hook: typeof parsed.hook === "string" ? parsed.hook : base.hook,
          script: typeof parsed.script === "string" ? parsed.script : base.script,
          voiceover: typeof parsed.voiceover === "string" ? parsed.voiceover : base.voiceover,
          caption: typeof parsed.caption === "string" ? parsed.caption : base.caption,
          cta: typeof parsed.cta === "string" ? parsed.cta : base.cta,
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
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data, generated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "AI generation failed." }, { status: 500 });
  }
}
