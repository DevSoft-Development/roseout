import PromotionCenterClient from "./PromotionCenterClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function PromotionsPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const locationId = first(params.locationId) || first(params.adminLocationId) || "";
  const funded = first(params.funded) === "1";
  const campaignId = first(params.campaign) || "";
  return <PromotionCenterClient locationId={locationId} funded={funded} campaignId={campaignId} />;
}
