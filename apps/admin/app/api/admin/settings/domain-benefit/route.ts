import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  DEFAULT_DOMAIN_BENEFIT_SETTINGS,
  getDomainBenefitSettings,
} from "@/lib/domains/benefit-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  await getCurrentAdmin();
  return NextResponse.json({ settings: await getDomainBenefitSettings() });
}

export async function PATCH(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const body = await request.json().catch(() => ({}));

  const value = {
    firstYearIncluded:
      typeof body?.firstYearIncluded === "boolean"
        ? body.firstYearIncluded
        : DEFAULT_DOMAIN_BENEFIT_SETTINGS.firstYearIncluded,
    renewalIncluded:
      typeof body?.renewalIncluded === "boolean"
        ? body.renewalIncluded
        : DEFAULT_DOMAIN_BENEFIT_SETTINGS.renewalIncluded,
  };

  const { error } = await getAdminDatabaseClient()
    .from("app_settings")
    .upsert({
      key: "partner_pro_domain_benefit",
      value,
      updated_by: admin.user_id,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Unable to save Partner Pro domain benefit settings", error);
    return NextResponse.json(
      { error: "Unable to save domain benefit settings." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, settings: value });
}
