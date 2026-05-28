import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { error, supabase } = await requireAdminApiRole([
    "superadmin",
    "admin",
  ]);

  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return Response.json({ users: [] });
    }

    const { data: users, error: fetchError } = await supabase
      .from("users")
      .select("id,email,full_name,phone,role,subscription_status,created_at")
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(8);

    if (fetchError) {
      return Response.json(
        { error: fetchError.message, users: [] },
        { status: 500 }
      );
    }

    const userIds = (users || []).map((user) => user.id);

    let plans: any[] = [];

    if (userIds.length > 0) {
      const { data: planData } = await supabase
        .from("saved_plans")
        .select("id,user_id,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });

      plans = planData || [];
    }

    const enhancedUsers = (users || []).map((user) => {
      const userPlans = plans.filter((plan) => plan.user_id === user.id);

      return {
        ...user,
        saved_plans_count: userPlans.length,
        last_activity: userPlans[0]?.created_at || user.created_at || null,
      };
    });

    return Response.json({ users: enhancedUsers });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Server error", users: [] },
      { status: 500 }
    );
  }
}