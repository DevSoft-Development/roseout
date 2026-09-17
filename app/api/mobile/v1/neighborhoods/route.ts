import { NextRequest } from "next/server";
import { mobileJson } from "@/app/api/mobile/v1/_lib/response";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type LocationAreaRow = {
  neighborhood: string | null;
  borough: string | null;
  city: string | null;
  state: string | null;
};

function clean(value: string | null | undefined) {
  const next = String(value || "").trim();
  return next || null;
}

function optionFromRow(row: LocationAreaRow) {
  const neighborhood = clean(row.neighborhood);
  if (!neighborhood) return null;

  const borough = clean(row.borough);
  const city = clean(row.city);
  const state = clean(row.state);
  const context = [borough, city && city.toLowerCase() !== borough?.toLowerCase() ? city : null, state]
    .filter(Boolean) as string[];
  const label = [neighborhood, ...context].join(", ");

  return {
    key: [neighborhood, borough, city, state].map((part) => String(part || "").toLowerCase()).join("|"),
    neighborhood,
    borough,
    city,
    state,
    label,
  };
}

export async function GET(req: NextRequest) {
  const query = String(req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  if (query.length < 2) return mobileJson({ ok: true, neighborhoods: [] });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("locations")
    .select("neighborhood,borough,city,state")
    .not("neighborhood", "is", null)
    .ilike("neighborhood", `%${query}%`)
    .limit(120);

  if (error) {
    console.error("mobile neighborhood lookup failed", { message: error.message });
    return mobileJson({ ok: true, neighborhoods: [] });
  }

  const unique = new Map<string, ReturnType<typeof optionFromRow>>();
  for (const row of (data || []) as LocationAreaRow[]) {
    const option = optionFromRow(row);
    if (option && !unique.has(option.key)) unique.set(option.key, option);
  }

  const normalizedQuery = query.toLowerCase();
  const neighborhoods = Array.from(unique.values())
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .sort((a, b) => {
      const aName = a.neighborhood.toLowerCase();
      const bName = b.neighborhood.toLowerCase();
      const aStarts = aName.startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = bName.startsWith(normalizedQuery) ? 0 : 1;
      return aStarts - bStarts || a.label.localeCompare(b.label);
    })
    .slice(0, 12);

  return mobileJson({ ok: true, neighborhoods });
}
