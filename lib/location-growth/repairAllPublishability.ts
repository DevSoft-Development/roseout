import { ACTIVE_MARKET_STATES, buildPublishabilityUpdate, evaluateLocationPublishability } from "@/lib/location-publishability";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, any>;
type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
type GooglePlace = {
  id?: