import { redirect } from "next/navigation";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Edit Location",
  description: "Update location listing details on TheOutHaven.",
  path: "/locations/edit",
  noIndex: true,
});
type RedirectPageProps = {
  params: Promise<{
    type: string;
    id: string;
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

function buildQueryString(
  searchParams: Record<string, string | string[] | undefined>,
) {
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
  const { type, id } = await params;
  const resolvedSearchParams = await searchParams;

  redirect(
    `/locations/${canonicalLocationType(type)}/${encodeURIComponent(id)}/edit${buildQueryString(
      resolvedSearchParams,
    )}`,
  );
}
