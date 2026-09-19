import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";

export default function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <BusinessGrowthProPage module="promotions" searchParams={searchParams} />;
}
