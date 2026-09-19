import { redirect } from "next/navigation";

type LegacyClaimSearchParams = Promise<{ code?: string; token?: string }>;

export default async function LegacyClaimLocationPage({
  searchParams,
}: {
  searchParams: LegacyClaimSearchParams;
}) {
  const params = await searchParams;
  const code = params.code || params.token || "";
  redirect(code ? `/business/claim?code=${encodeURIComponent(code)}` : "/business/claim");
}
