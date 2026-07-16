export const ACTIVE_MARKET_STATES = ["NY", "NJ", "CT"] as const;
export type ActiveMarketState = (typeof ACTIVE_MARKET_STATES)[number];

export type LocationPublishabilityInput = {
  id?: string | null;
  name?: string | null;
  state?: string | null;
  status?: string | null;
  data_status?: string | null;
  quality_status?: string | null;
  source_quality_status?: string | null;
  import_confidence?: string | null;
 