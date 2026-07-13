import { runEnterpriseSearch } from "@/lib/search/enterprise";
import type {
  EnterpriseLocation,
  EnterpriseSearchResult,
} from "@/lib/search/enterprise/types";
import type { UserSearchLocation } from "@/lib/search/enterprise/markets";
import { runAnchoredNearbySearch } from "@/lib/search/enterprise/anchoredNearby";
import { filterAnchoredRestaurant