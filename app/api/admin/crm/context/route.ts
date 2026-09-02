import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { platformCoreApiConfigured, resolveCrmContextViaCoreApi } from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseCrmContextSearchParams, resolveCrmContext } from "@/lib/crm/context";

export const dynamic = "force-dynamic";

async function resolveLocally(raw: Record<string, string | undefined>) {
  const context = await resolveCrmContext(parseCrmContextSearchParams(raw));

  const [locationResult, accountResult, contactResult, opportunityResult] = await Promise.all([
    context.locationId
      ? supabaseAdmin.from("locations").select("id,name,city,state").eq("id", context.locationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.accountId
      ? supabaseAdmin.from("crm_accounts").select("id,name").eq("id", context.accountId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.contactId
      ? supabaseAdmin.from("crm_contacts").select("id,full_name,email").eq("id", context.contactId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.opportunityId
      ? supabaseAdmin.from("crm_opportunities").select("id,name").eq("id", context.opportunityId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const firstError = [locationResult, accountResult, contactResult, opportunityResult].find((result) => result.error)?.error;
  if (firstError) {
    console.error("crm_context_resolution_failed", {
      code: firstError.code,
      message: firstError.message,
      locationId: context.locationId,
      accountId: context.accountId,
      contactId: context.contactId,
      opportunityId: context.opportunityId,
    });
    return null;
  }

  return {
    context,
    labels: {
      location: locationResult.data,
      account: accountResult.data,
      contact: contactResult.data,
      opportunity: opportunityResult.data,
    },
  };
}

export async function GET(request: NextRequest) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = parseCrmContextSearchParams(raw);

  if (platformCoreApiConfigured()) {
    try {
      const remote = await resolveCrmContextViaCoreApi(parsed);
      return NextResponse.json(remote);
    } catch (error) {
      console.warn("crm_context_core_api_fallback", {
        message: error instanceof Error ? error.message : "core_api_unavailable",
      });
    }
  }

  const local = await resolveLocally(raw);
  if (!local) return NextResponse.json({ error: "CRM context could not be resolved." }, { status: 500 });
  return NextResponse.json(local);
}
