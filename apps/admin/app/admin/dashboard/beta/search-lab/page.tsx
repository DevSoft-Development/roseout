import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; query?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? sp.query;
  redirect(
    `/admin/dashboard/search-health${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
}
