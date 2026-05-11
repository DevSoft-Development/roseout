import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminUser = await getCurrentAdmin();

    return NextResponse.json({
      user: adminUser,
      role: adminUser.role,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json(
      { error: "Missing userId" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };

  cookieStore.set("theouthaven_admin_user_id", userId, options);
  cookieStore.set("roseout_admin_user_id", userId, options);

  return NextResponse.json({
    success: true,
  });
}