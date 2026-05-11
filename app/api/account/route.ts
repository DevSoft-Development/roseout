import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function PATCH(request: Request) {
  const sessionSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fullName = clean(body.full_name);
  const phone = clean(body.phone);

  const { error: profileError } = await supabaseAdmin.from("users").upsert(
    {
      id: user.id,
      email: user.email || null,
      full_name: fullName || null,
      phone: phone || null,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: fullName || null,
        phone: phone || null,
      },
    }
  );

  if (authError) {
    return Response.json({ error: authError.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
