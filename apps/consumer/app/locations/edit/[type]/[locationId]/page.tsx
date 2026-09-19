import { redirect } from "next/navigation";

type RedirectPageProps = {
  params: Promise<{
    type: string;
    locationId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function canonicalLocationType(value: string) {
  if (value === "restaurants" || value === "restaurant") return "restaurants";
  if (value === "activities" || value === "activity" || value === "activitys") {
    return "activities";
  }

  return value;
}

function buildQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }

    if (value !== undefined) query.set(key, value);
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export default async function LegacyEditLocationRedirect({
  params,
  searchParams,
}: RedirectPageProps) {
  const { type, locationId } = await params;
  const resolvedSearchParams = await searchParams;

  redirect(
    `/locations/${canonicalLocationType(type)}/${encodeURIComponent(locationId)}/edit${buildQueryString(
      resolvedSearchParams
    )}`
  );
}
