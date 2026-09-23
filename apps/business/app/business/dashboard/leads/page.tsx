import { BusinessEventLeadsPage } from "@/components/growth-pro/BusinessEventLeadsPage";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <BusinessEventLeadsPage searchParams={searchParams} />;
}
