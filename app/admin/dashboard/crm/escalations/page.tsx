import { redirect } from "next/navigation";

export default async function EscalationsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set("view", "escalated");
  redirect(`/admin/dashboard/crm/support?${query.toString()}`);
}
