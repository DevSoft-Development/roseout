import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { createFeatureFlag, listFeatureFlags } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

async function requireSuperadmin() {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return { admin: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (admin.role !== "superadmin") {
    return { admin: null, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { admin, response: null };
}

export async function GET(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;

  const sp = new URL(request.url).searchParams;
  const result = await listFeatureFlags({
    search: sp.get("search") || undefined,
    filter: sp.get("filter") || undefined,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    flags: result.flags,
    envFlags: [
      {
        key: "NEXT_PUBLIC_*",
        name: "Environment flags",
        enabled: true,
        readonly: true,
      },
    ],
  });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await createFeatureFlag(body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ flag: result.flag }, { status: result.status });
}
