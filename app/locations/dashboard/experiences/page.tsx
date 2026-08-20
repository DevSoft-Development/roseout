import { redirect } from "next/navigation";

type Params = Promise<Record<string, string | string[] | undefined>>;

function append(query: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
  else if (value) query.set(key, value);
}

export default async function LocationExperiencesRedirect({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) append(query, key, value);
  query.set("tab", "experiences");
  redirect(`/locations/dashboard/events-experiences?${query.toString()}`);
}
