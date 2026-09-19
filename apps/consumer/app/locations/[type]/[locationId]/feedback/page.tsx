import PublicGrowthProPage from "@/components/growth-pro/PublicGrowthProPage";
export default async function Page({ params }: { params: Promise<{ type: string; locationId: string }> }) { const { type, locationId } = await params; return <PublicGrowthProPage type={type} locationId={locationId} mode="feedback" />; }
