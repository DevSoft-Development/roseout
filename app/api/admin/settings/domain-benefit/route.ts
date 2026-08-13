import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";
import { DEFAULT_DOMAIN_BENEFIT_SETTINGS, getDomainBenefitSettings } from "@/lib/domains/benefit-settings";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return await getAdminLoginRole(supabaseAdmin as any, { id: user.id, email: user.email ?? null }) ? user : null;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ settings: await getDomainBenefitSettings() });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const value = {
    firstYearIncluded: typeof body?.firstYearIncluded === "boolean" ? body.firstYearIncluded : DEFAULT_DOMAIN_BENEFIT_SETTINGS.firstYearIncluded,
    renewalIncluded: typeof body?.renewalIncluded === "boolean" ? body.renewalIncluded : DEFAULT_DOMAIN_BENEFIT_SETTINGS.renewalIncluded,
  };

  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: "partner_pro_domain_benefit",
    value,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Unable to save Partner Pro domain benefit settings", error);
    return NextResponse.json({ error: "Unable to save domain benefit settings." }, { status: 500 });
  }

  return NextResponse.json({ success: true, settings: value });
}
