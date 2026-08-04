import { redirect } from "next/navigation";

export default async function MyQueueRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (!query.has("view")) query.set("view", "my-queue");
  redirect(`/admin/dashboard/crm/my-work?${query.toString()}`);
}
