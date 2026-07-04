import { redirect } from "next/navigation";

export default async function ClaimActivityRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/claim/${encodeURIComponent(token)}`);
}
