import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
export const dynamic = "force-dynamic";
export default function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }){ return <BusinessGrowthProPage module="branding" searchParams={searchParams} />; }
