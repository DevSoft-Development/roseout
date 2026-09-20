import { redirect } from "next/navigation";

type SearchValue = string | string[] | undefined;
type Props = {
  searchParams?: Promise<Record<string, SearchValue>> | Record<string, SearchValue>;
};

function appendParam(query: URLSearchParams, key: string, value: SearchValue) {
  if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
  else if (value) query.set(key, value);
}

export default async function ReserveDashboardReservationsRedirect({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => appendParam(query, key, value));
  const qs = query.toString();
  redirect(`/reserve/dashboard${qs ? `?${qs}` : ""}`);
}
