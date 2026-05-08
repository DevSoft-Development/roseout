import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function getCurrentUserId() {
  const cookieStore = await cookies();

  const impersonatedUserId = cookieStore.get(
    "theouthaven_impersonate_user_id"
  )?.value;

  // 👁 If admin is impersonating → use that user
  if (impersonatedUserId) {
    return impersonatedUserId;
  }

  // 👤 Otherwise use real logged-in user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
}