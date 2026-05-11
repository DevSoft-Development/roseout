import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function isMissingOptionalProfileColumn(message: string) {
  return ["username", "bio", "address", "city", "state", "zip_code"].some(
    (column) => message.includes(column)
  );
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
  const username = clean(body.username);
  const bio = clean(body.bio);
  const address = clean(body.address);
  const city = clean(body.city);
  const state = clean(body.state);
  const zipCode = clean(body.zip_code);

  const baseProfile = {
    id: user.id,
    email: user.email || null,
    full_name: fullName || null,
    phone: phone || null,
  };

  const fullProfile = {
    ...baseProfile,
    username: username || null,
    bio: bio || null,
    address: address || null,
    city: city || null,
    state: state || null,
    zip_code: zipCode || null,
  };

  const { error: profileError } = await supabaseAdmin
    .from("users")
    .upsert(fullProfile, { onConflict: "id" });

  if (profileError) {
    if (!isMissingOptionalProfileColumn(profileError.message)) {
      return Response.json({ error: profileError.message }, { status: 500 });
    }

    const { error: fallbackProfileError } = await supabaseAdmin
      .from("users")
      .upsert(baseProfile, { onConflict: "id" });

    if (fallbackProfileError) {
      return Response.json(
        { error: fallbackProfileError.message },
        { status: 500 }
      );
    }
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: fullName || null,
        phone: phone || null,
        username: username || null,
        bio: bio || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip_code: zipCode || null,
      },
    }
  );

  if (authError) {
    return Response.json({ error: authError.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
