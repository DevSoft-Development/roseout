import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserOrganizationContext } from "@/lib/organizations/context";
import { getOrganizationTrustState } from "@/lib/organizations/verification";
import VerificationWorkspace from "./VerificationWorkspace";

export const dynamic = "force-dynamic";

export default async function VerificationPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const requestedOrganizationId = Array.isArray(params.organizationId) ? params.organizationId[0] : params.organizationId;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect(`/login?next=${encodeURIComponent("/business/dashboard/verification")}`);

  const context = await getUserOrganizationContext(user.id, requestedOrganizationId || null);
  if (!context.organizations.length) redirect("/business/onboarding");
  const organization = context.currentOrganization || context.organizations[0];
  if (!organization) redirect("/business/onboarding");
  if (!["owner", "admin"].includes(organization.role)) {
    redirect(`/business/dashboard?organizationId=${encodeURIComponent(organization.id)}`);
  }
  const trust = await getOrganizationTrustState(organization.id);

  return (
    <VerificationWorkspace
      organization={organization}
      initialTrust={trust}
      userEmail={user.email || ""}
    />
  );
}
