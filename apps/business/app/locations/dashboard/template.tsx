import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

const ADMIN_CONTEXT_COOKIES = [
  "theouthaven_impersonate_location_id",
  "theouthaven_impersonate_user_id",
  "theouthaven_admin_user_id",
  "theouthaven_impersonate_target_type",
] as const;

export default async function LocationsDashboardTemplate({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) redirect("/login?next=/locations/dashboard");

  const cookieStore = await cookies();
  const hasAdminContextCookie = ADMIN_CONTEXT_COOKIES.some((name) => Boolean(cookieStore.get(name)?.value));

  if (hasAdminContextCookie) {
    const access = await getLocationOwnerAccess(user.id);
    if (!access.isAdmin) redirect("/api/locations/dashboard/clear-invalid-impersonation");
  }

  return children;
}
