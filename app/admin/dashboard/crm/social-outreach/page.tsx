import { redirect } from "next/navigation";

export default async function SocialOutreachRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set("channel", "social");
  redirect(`/admin/dashboard/crm/outreach?${query.toString()}`);
}
