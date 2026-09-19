import { redirect } from "next/navigation";
import { normalizeClaimCode } from "@/lib/claimQr";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token?: string }>;
}) {
  const { token } = await params;
  const code = normalizeClaimCode(token || "");

  if (!code) {
    redirect("/business/claim");
  }

  redirect(`/business/claim?code=${encodeURIComponent(code)}`);
}
