import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["superadmin", "admin"]);

export async function POST() {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return Response.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(admin.role)) {
    return Response.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const { data, error } = await getAdminDatabaseClient().functions.invoke(
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

    return Response.json(data ?? { success: true }, {
      status: data?.success === false ? 400 : 200,
    });
  } catch (error) {
    console.error("Microsoft readiness request failed", error);
    return Response.json(
      { success: false, error: "Microsoft readiness check could not be completed." },
      { status: 500 },
    );
  }
}
