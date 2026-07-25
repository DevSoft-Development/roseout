import type {
  EnterpriseLocation,
  EnterprisePair,
  PairDistanceMode,
  PairingPreference,
  SearchIntent,
} from "./types";
import {
  DEFAULT_MIXED_OUTING_MAX_PAIR_DISTANCE_MILES,
  estimateWalkingMinutes,
  getPairDistanceMiles,
  isWalkablePair,
} from "./distance";
import { scoreGeoMatch } from "./geo-tax