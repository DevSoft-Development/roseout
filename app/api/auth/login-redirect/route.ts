import { NextResponse } from "next/server";
import {
  createClient as createSupabaseAdminClient,
  type User,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ADMIN_DASHBOARD_PATH = "/admin/dashboard";

const roleRedirects: Record<string, string> = {
  superuser: ADMIN_DASHBOARD_PATH,
  superadmin: ADMIN_DASHBOARD_PATH,
  admin: ADMIN_DASHBOARD_PATH,
  editor: "/admin/restaurants",
  reviewer: "/admin/claims",
  viewer: "/admin/import-history",
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

function normalizeRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function resolveRedirectPath(user: User | null) {
  if (!user?.email) return "/create";

  if (user.user_metadata?.is_superadmin || user.app_metadata?.is_superadmin) {
    return ADMIN_DASHBOARD_PATH;
  }

  const metadataRole = normalizeRole(user.user_metadata?.role);
  const appMetadataRole = normalizeRole(user.app_metadata?.role);

  if (roleRedirects[metadataRole] || roleRedirects[appMetadataRole]) {
    return roleRedirects[metadataRole] || roleRedirects[appMetadataRole];
  }

  const email = user.email.toLowerCase();
  const adminSupabase = createAdminClient();

  const { data: adminUser, error: adminError } = await adminSupabase
    .from("admin_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (adminError) throw adminError;

  const adminRole = normalizeRole(adminUser?.role);

  if (roleRedirects[adminRole]) {
    return roleRedirects[adminRole];
  }

  const { data: appUser, error: appUserError } = await adminSupabase
    .from("users")
    .select("role,is_superadmin")
    .eq("email", email)
    .maybeSingle();

  if (appUserError) throw appUserError;

  if (appUser?.is_superadmin) {
    return ADMIN_DASHBOARD_PATH;
  }

  const appRole = normalizeRole(appUser?.role);

  return roleRedirects[appRole] || "/create";
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    return NextResponse.json({ redirectPath: await resolveRedirectPath(user) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not determine redirect.";

    return NextResponse.json(
      { error: message, redirectPath: "/create" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const { accessToken } = (await req.json()) as { accessToken?: string };

  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing access token.", redirectPath: "/create" },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const {
    data: { user },
    error: userError,
  } = await adminSupabase.auth.getUser(accessToken);

  if (userError) {
    return NextResponse.json(
      { error: userError.message, redirectPath: "/create" },
      { status: 401 }
    );
  }

  try {
    return NextResponse.json({ redirectPath: await resolveRedirectPath(user) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not determine redirect.";

    return NextResponse.json(
      { error: message, redirectPath: "/create" },
      { status: 500 }
    );
  }
}
