import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export async function POST() {
  const { error: authError, supabase } = await requireAdminApiRole(
    ADMIN_PAGE_ACCESS.careersTeamConversion,
  );
  if (authError) return authError;

  try {
    const { data, error } = await supabase.functions.invoke(
      "career-microsoft-readiness",
      { body: {} },
    );

    if (error) {
      console.error("Microsoft readiness Edge Function failed", error);
      return Response.json(
        { success: false, error: "Microsoft readiness check could not be completed." },
        { status: 502 },
      );
    }

    const status = data?.success === false ? 400 : 200;
    return Response.json(data ?? { success: true }, { status });
  } catch (error) {
    console.error("Microsoft readiness request failed", error);
    return Response.json(
      { success: false, error: "Microsoft readiness check could not be completed." },
      { status: 500 },
    );
  }
}
