import { redirect } from "next/navigation";

export default async function ClaimActivityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/claim/${encodeURIComponent(token)}`);
}
