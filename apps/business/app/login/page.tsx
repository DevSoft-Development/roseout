import { redirect } from "next/navigation";

type SearchValue = string | string[] | undefined;

export default async function BusinessLoginAlias({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchValue>>;
}) {
  const params = searchParams ? await searchParams : {};
  const forwarded = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) forwarded.append(key, entry);
    } else if (typeof value === "string") {
      forwarded.set(key, value);
    }
  }

  const query = forwarded.toString();
  redirect(`/business/login${query ? `?${query}` : ""}`);
}
