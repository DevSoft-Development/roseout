import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";

export const runtime = "nodejs";

const BUCKET = "website-brand-assets";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function authorizedWebsite(locationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Please log in to continue." }, { status: 401 }), website: null };

  const location = await getAuthorizedWebsiteLocation(user, locationId, "*");
  if (!location) return { error: NextResponse.json({ error: "Location not found." }, { status: 404 }), website: null };

  const { data: website, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,custom_content")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Unable to load website branding." }, { status: 500 }), website: null };
  if (!website) return { error: NextResponse.json({ error: "Create the website draft before uploading a logo." }, { status: 409 }), website: null };
  return { error: null, website };
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const locationId = String(form?.get("location_id") || "").trim();
  const file = form?.get("logo");
  if (!locationId || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose a logo image to upload." }, { status: 400 });
  }
  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json({ error: "Logo must be a PNG, JPG, or WebP image." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo must be smaller than 5 MB." }, { status: 400 });
  }

  const auth = await authorizedWebsite(locationId);
  if (auth.error || !auth.website) return auth.error!;

  const customContent = objectValue(auth.website.custom_content);
  const previousBrand = objectValue(customContent.brand);
  const previousPath = typeof previousBrand.logo_path === "string" ? previousBrand.logo_path : "";
  const extension = ALLOWED_TYPES[file.type];
  const path = `${locationId}/logo-${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (uploadError) {
    console.error("WEBSITE_LOGO_UPLOAD_FAILED", { locationId, error: uploadError });
    return NextResponse.json({ error: "We could not upload the logo right now." }, { status: 500 });
  }

  const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const logoUrl = publicData.publicUrl;
  const nextCustomContent = {
    ...customContent,
    brand: {
      ...previousBrand,
      logo_url: logoUrl,
      logo_path: path,
      logo_mime_type: file.type,
      logo_updated_at: new Date().toISOString(),
    },
  };

  const { data: website, error: updateError } = await supabaseAdmin
    .from("business_websites")
    .update({ custom_content: nextCustomContent, updated_at: new Date().toISOString() })
    .eq("id", auth.website.id)
    .select("*")
    .single();

  if (updateError) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: "We could not save the logo to this website." }, { status: 500 });
  }

  if (previousPath && previousPath !== path && previousPath.startsWith(`${locationId}/`)) {
    await supabaseAdmin.storage.from(BUCKET).remove([previousPath]).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, website, logo_url: logoUrl });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

  const auth = await authorizedWebsite(locationId);
  if (auth.error || !auth.website) return auth.error!;

  const customContent = objectValue(auth.website.custom_content);
  const brand = objectValue(customContent.brand);
  const logoPath = typeof brand.logo_path === "string" ? brand.logo_path : "";
  const nextBrand = { ...brand };
  delete nextBrand.logo_url;
  delete nextBrand.logo_path;
  delete nextBrand.logo_mime_type;
  delete nextBrand.logo_updated_at;

  const { data: website, error } = await supabaseAdmin
    .from("business_websites")
    .update({ custom_content: { ...customContent, brand: nextBrand }, updated_at: new Date().toISOString() })
    .eq("id", auth.website.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "We could not remove the logo right now." }, { status: 500 });

  if (logoPath && logoPath.startsWith(`${locationId}/`)) {
    await supabaseAdmin.storage.from(BUCKET).remove([logoPath]).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, website });
}
