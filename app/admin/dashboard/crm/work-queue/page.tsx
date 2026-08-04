import { redirect } from "next/navigation";

export default async function WorkQueueRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/admin/dashboard/crm/my-work${suffix ? `?${suffix}` : ""}`);
}
