import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/getCurrentUserId";
import { getPersonalizationPreferences, setPersonalizationPreferences } from "@/lib/privacy/personalization-preferences";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, preferences: await getPersonalizationPreferences(userId) });
  } catch {
    return NextResponse.json({ error: "Preferences unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const update: { personalizationEnabled?: boolean; searchHistoryPersonalizationEnabled?: boolean } = {};
  if (typeof body.personalizationEnabled === "boolean") update.personalizationEnabled = body.personalizationEnabled;
  if (typeof body.searchHistoryPersonalizationEnabled === "boolean") update.searchHistoryPersonalizationEnabled = body.searchHistoryPersonalizationEnabled;
  try {
    return NextResponse.json({ ok: true, preferences: await setPersonalizationPreferences(userId, update) });
  } catch {
    return NextResponse.json({ error: "Preferences could not be saved" }, { status: 503 });
  }
}
