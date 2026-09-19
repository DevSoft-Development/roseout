import { createClient } from "@/lib/supabase-server";
import { createOrganization } from "@/lib/organizations/service";
import { getUserOrganizationContext } from "@/lib/organizations/context";
import type { OrganizationType } from "@/lib/organizations/types";

const ALLOWED_TYPES = new Set<OrganizationType>([
  "business",
  "restaurant_group",
  "venue",
  "promoter",
  "nonprofit",
  "church",
  "community",
  "museum",
  "creator",
  "individual_organizer",
  "other",
]);

async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const context = await getUserOrganizationContext(user.id);
    return Response.json({
      organizations: context.organizations,
      currentOrganization: context.currentOrganization,
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Unable to load organizations." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body?.name || "").trim();
    const legalName = String(body?.legalName || "").trim() || null;
    const requestedType = String(body?.organizationType || "business") as OrganizationType;

    if (!name) {
      return Response.json({ error: "Organization name is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(requestedType)) {
      return Response.json({ error: "Invalid organization type." }, { status: 400 });
    }

    const organization = await createOrganization({
      userId: user.id,
      name,
      legalName,
      organizationType: requestedType,
      metadata: {
        onboarding_source: "business_onboarding",
        creator_email: user.email || null,
      },
    });

    return Response.json(
      {
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          organizationType: organization.organization_type,
        },
        dashboardUrl: `/business/dashboard?organizationId=${encodeURIComponent(String(organization.id))}`,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Unable to create organization." },
      { status: 500 },
    );
  }
}
