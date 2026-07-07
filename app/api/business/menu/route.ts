import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { getEditableLocationMenu, MenuAccessError, MenuValidationError, saveLocationMenu } from "@/lib/locations/menu";

export const dynamic = "force-dynamic";

async function resolve(req: Request, body?: any) {
  const url = new URL(req.url);
  const pick = (key: string) => body?.[key] ?? url.searchParams.get(key);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 }) };
  const access = await resolveEditableLocationContext({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: pick("locationId"),
    adminLocationId: pick("adminLocationId"),
    demoLocationId: pick("demoLocationId"),
    sourceId: pick("sourceId"),
    type: pick("type"),
    demo: pick("demo") === "1" || pick("demo") === true,
    fromDemoCenter: pick("fromDemoCenter") === "1" || pick("fromDemoCenter") === true,
  });
  if (!access) return { error: NextResponse.json({ ok: false, message: "You do not have permission to edit this menu" }, { status: 403 }) };
  return { access };
}

function errorResponse(error: unknown) {
  if (error instanceof MenuValidationError) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  if (error instanceof MenuAccessError) return NextResponse.json({ ok: false, message: error.message }, { status: 403 });
  return NextResponse.json({ ok: false, message: "We could not save the menu right now" }, { status: 500 });
}

export async function GET(req: Request) {
  const ctx = await resolve(req);
  if (ctx.error) return ctx.error;
  return NextResponse.json(await getEditableLocationMenu(ctx.access.canonicalLocationId, ctx.access));
}

async function mutate(req: Request, method: "POST" | "PATCH" | "DELETE") {
  const body = await req.json().catch(() => ({}));
  const ctx = await resolve(req, body);
  if (ctx.error) return ctx.error;
  try { return NextResponse.json(await saveLocationMenu(ctx.access.canonicalLocationId, body, ctx.access, method)); }
  catch (error) { return errorResponse(error); }
}

export async function POST(req: Request) { return mutate(req, "POST"); }
export async function PATCH(req: Request) { return mutate(req, "PATCH"); }
export async function DELETE(req: Request) { return mutate(req, "DELETE"); }
