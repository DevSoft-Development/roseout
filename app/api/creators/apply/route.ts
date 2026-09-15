import { NextRequest, NextResponse } from "next/server";
import { createCreatorApplication } from "@/lib/creator-partners/program";
import { createClient } from "@/lib/supabase-server";

function values(form: FormData, key: string) {
  return form.getAll(key).map((value) => String(value).trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body.agree !== true && body.agree !== "1") return NextResponse.json({ error: "Please accept the Creator Partner terms to apply." }, { status: 400 });
      const result = await createCreatorApplication({
        displayName: String(body.display_name || body.displayName || ""),
        email: String(body.email || ""),
        phone: String(body.phone || ""),
        instagram: String(body.instagram || ""),
        tiktok: String(body.tiktok || ""),
        youtube: String(body.youtube || ""),
        followerCount: body.follower_count === undefined || body.follower_count === "" ? null : Number(body.follower_count),
        primaryMarket: String(body.primary_market || ""),
        niches: Array.isArray(body.niches) ? body.niches.map(String) : [],
        businessRelationships: String(body.business_relationships || ""),
        userId: user?.id || null,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const form = await request.formData();
    if (String(form.get("agree") || "") !== "1") return NextResponse.redirect(new URL("/creators/apply?error=terms", request.url), 303);
    const result = await createCreatorApplication({
      displayName: String(form.get("display_name") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      instagram: String(form.get("instagram") || ""),
      tiktok: String(form.get("tiktok") || ""),
      youtube: String(form.get("youtube") || ""),
      followerCount: String(form.get("follower_count") || "") ? Number(form.get("follower_count")) : null,
      primaryMarket: String(form.get("primary_market") || ""),
      niches: values(form, "niches"),
      businessRelationships: String(form.get("business_relationships") || ""),
      userId: user?.id || null,
    });
    const url = new URL("/creators/apply", request.url);
    url.searchParams.set("submitted", "1");
    if (result.existing) url.searchParams.set("existing", "1");
    return NextResponse.redirect(url, 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn’t submit your application. Please try again.";
    if ((request.headers.get("content-type") || "").includes("application/json")) return NextResponse.json({ error: message }, { status: 400 });
    const url = new URL("/creators/apply", request.url);
    url.searchParams.set("error", "submit");
    return NextResponse.redirect(url, 303);
  }
}
