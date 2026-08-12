import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { demoMetadata, MIRROR_DEMO_KEY } from "@/lib/demo/demo-center";

function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}

async function resolveMarketingAccess(body: any) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ message: "Not signed in" }, { status: 401 }),
    };
  }

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: body.locationId,
    adminLocationId: body.adminLocationId,
    demoLocationId: body.demoLocationId,
    sourceId: body.sourceId,
    type: body.type,
    demo: toBoolean(body.demo),
    fromDemoCenter: toBoolean(body.fromDemoCenter),
    allowDemoPreview: true,
    permission: "marketing.edit",
  });

  if (guard.error) {
    return {
      error: NextResponse.json(
        { message: "You do not have access to this location." },
        { status: guard.error.status },
      ),
    };
  }

  return { access: guard.access, user };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ctx = await resolveMarketingAccess(body);
  if (ctx.error) return ctx.error;

  const loc = ctx.access.location || {};
  const contentType = String(body.contentType || "Instagram caption");
  const goal = String(body.goal || "weekend visits");
  const name = String(
    loc.name ||
      loc.restaurant_name ||
      loc.activity_name ||
      body.name ||
      "this location",
  );
  const area = String(
    loc.neighborhood || loc.city || body.neighborhood || "nearby",
  );
  const category = String(
    loc.primary_category ||
      loc.category ||
      loc.cuisine ||
      loc.activity_type ||
      body.category ||
      "night-out spot",
  );
  const copy = `${contentType} for ${name}\n\nLooking for a ${category} in ${area}? Plan your next visit to ${name} and check out the latest profile details, hours, menu, offers, and QR-friendly updates on TheOutHaven.\n\nGoal: ${goal}.`;
  const isDemo =
    loc.demo_key === MIRROR_DEMO_KEY ||
    (toBoolean(body.demo) && toBoolean(body.fromDemoCenter));

  const { data: generation, error: generationError } = await supabaseAdmin
    .from("location_marketing_generations")
    .insert({
      location_id: ctx.access.canonicalLocationId,
      created_by: ctx.user.id,
      generation_type: "copy",
      channel: contentType,
      goal,
      source_type: "location_editor",
      tone: String(body.tone || "brand"),
      prompt_inputs: {
        contentType,
        goal,
        name,
        area,
        category,
        heroImageUrl: body.heroImageUrl || null,
      },
      generated_content: {
        headline: `Bring more guests to ${name}`,
        body: copy,
      },
      status: "draft",
      metadata: isDemo
        ? { ...demoMetadata, generated_from: "production_marketing_api" }
        : { generated_from: "production_marketing_api" },
    })
    .select("id")
    .maybeSingle();

  if (generationError) {
    console.error("MARKETING_GENERATION_PERSIST_FAILED", {
      locationId: ctx.access.canonicalLocationId,
      message: generationError.message,
    });
  }

  return NextResponse.json({
    copy,
    draft: { headline: `Bring more guests to ${name}`, body: copy },
    locationId: ctx.access.canonicalLocationId,
    generationId: generation?.id || null,
    persisted: !generationError && Boolean(generation?.id),
    demo: isDemo,
  });
}
