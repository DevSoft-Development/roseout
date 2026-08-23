import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  const { error: authError, supabase } = await requireAdminApiRole(
    ADMIN_PAGE_ACCESS.careersTeamConversion,
  );
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { data, error } = await supabase.functions.invoke("career-workflow", {
      body: { ...body, action: "onboard", applicationId: id },
    });

    if (error) {
      console.error("Career onboarding Edge Function failed", error);
      return Response.json(
        { success: false, error: "Employee onboarding could not be completed." },
        { status: 502 },
      );
    }

    const status = data?.success === false ? 400 : 200;
    return Response.json(data ?? { success: true }, { status });
  } catch (error) {
    console.error("Career onboarding request failed", error);
    return Response.json(
      { success: false, error: "Employee onboarding could not be completed." },
      { status: 500 },
    );
  }
}
