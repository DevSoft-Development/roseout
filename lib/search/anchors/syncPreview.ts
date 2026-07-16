import { normalizeAnchorText } from "./normalize";
import { inferAnchorTypeFromLocation, inferRadiusPolicyFromLocation, isEligibleApprovedAnchorLocation, locationDisplayName } from "./locationMapping";

type Scope = { mode?: "all" } | { mode: "market"; market: string } | { mode: "location_ids"; locationIds: string[] } | { mode: "missing_only" } | { mode: