import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  requireLocationPermission,
  type LocationAccessContext,
  type LocationPermission,
} from "@/lib/auth/locationOwnerAccess";
import {
  getEditableLocationMenu,
  MenuAccessError,
  MenuValidationError,
  saveLocationMenu,
} from "@/lib/locations/menu";
import type { MenuActorContext } from "@/lib/locations/menuTypes";

export const dynamic = "force-dynamic";

type MenuRouteContext = {
  access: MenuActorContext;
};

function toBoolean(value: unknown) {
  return value === true || value === "1" || value === "true";
}

function pickRequestValue(url: URL, body: any, key: string) {
  return body?.[key] ?? url.searchParams.get(key);
}

function menuAccessMessage(permission: LocationPermission, status: number, fallback?: string) {
  if (status === 400) return fallback || "Missing locationId.";
  if (permission === "menu.view") return "You do not have permission to view this menu";
  return "You do not have permission to edit this menu";
}

async function locationGuardErrorResponse(error: Response, permission: LocationPermission) {
  let fallback: string | undefined;
  try {
    const payload = await error.clone().json();
    fallback = payload?.message || payload?.error;
  } catch {
    fallback = undefined;
  }

  return NextResponse.json(
    { ok: false, message: menuAccessMessage(permission, error.status, fallback) },
    { status: error.status },
  );
}

function toMenuActorContext(access: LocationAccessContext): MenuActorContext | null {
  if (!access.canonicalLocationId || !access.location) return null;

  return {
    userId: access.userId ?? undefined,
    canonicalLocationId: String(access.canonicalLocationId),
    location: access.location as Record<string, any>,
    isAdmin: access.isAdmin,
    isDemoMode: access.isDemoLocation || access.isDemoPreview,
    permissions: {
      canRead: access.permissions.includes("menu.view"),
      canEdit: access.permissions.includes("menu.edit"),
    },
  };
}

async function resolve(
  req: Request,
  permission: LocationPermission,
  body?: any,
): Promise<MenuRouteContext | { error: Response }> {
  const url = new URL(req.url);
  const pick = (key: string) => pickRequestValue(url, body, key);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { ok: false, message: "Not signed in" },
        { status: 401 },
      ),
    };
  }

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: pick("locationId"),
    adminLocationId: pick("adminLocationId"),
    demoLocationId: pick("demoLocationId"),
    sourceId: pick("sourceId"),
    type: pick("type"),
    demo: toBoolean(pick("demo")),
    fromDemoCenter: toBoolean(pick("fromDemoCenter")),
    allowDemoPreview: true,
    permission,
  });

  if (guard.error) {
    return { error: await locationGuardErrorResponse(guard.error, permission) };
  }

  const actorContext = toMenuActorContext(guard.access);
  if (!actorContext) {
    return {
      error: NextResponse.json(
        { ok: false, message: "You do not have permission to access this menu" },
        { status: 403 },
      ),
    };
  }

  return { access: actorContext };
}

function errorResponse(error: unknown) {
  if (error instanceof MenuValidationError) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  if (error instanceof MenuAccessError) return NextResponse.json({ ok: false, message: error.message }, { status: 403 });
  return NextResponse.json({ ok: false, message: "We could not save the menu right now" }, { status: 500 });
}

export async function GET(req: Request) {
  const ctx = await resolve(req, "menu.view");
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await getEditableLocationMenu(ctx.access.canonicalLocationId, ctx.access));
}

async function mutate(req: Request, method: "POST" | "PATCH" | "DELETE") {
  const body = await req.json().catch(() => ({}));
  const ctx = await resolve(req, "menu.edit", body);
  if ("error" in ctx) return ctx.error;
  try { return NextResponse.json(await saveLocationMenu(ctx.access.canonicalLocationId, body, ctx.access, method)); }
  catch (error) { return errorResponse(error); }
}

export async function POST(req: Request) { return mutate(req, "POST"); }
export async function PATCH(req: Request) { return mutate(req, "PATCH"); }
export async function DELETE(req: Request) { return mutate(req, "DELETE"); }
