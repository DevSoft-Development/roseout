import { redirect } from "next/navigation";

export default async function LaunchVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token?.trim();
  if (!token) redirect("/launch/verified?status=invalid");
  redirect(`/api/launch/verify-email?token=${encodeURIComponent(token)}`);
}
