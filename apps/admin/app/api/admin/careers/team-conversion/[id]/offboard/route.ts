import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  await requireAdminRole(["superadmin", "admin"]);
  const supabase = getAdminDatabaseClient();

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { data, error } = await supabase.functions.invoke("career-workflow", {
      body: { ...body, action: "offboard", conversionId: id },
    });

    if (error) {
      console.error("Career offboarding Edge Function failed", error);
      return Response.json(
        { success: false, error: "Employee offboarding could not be completed." },
        { status: 502 },
      );
    }

    const status = data?.success === false ? 400 : 200;
    return Response.json(data ?? { success: true }, { status });
  } catch (error) {
    console.error("Career offboarding request failed", error);
    return Response.json(
      { success: false, error: "Employee offboarding could not be completed." },
      { status: 500 },
    );
  }
}
