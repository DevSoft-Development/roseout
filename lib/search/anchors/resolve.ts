import {
  inferAnchorTypeFromLocation,
  inferRadiusPolicyFromLocation,
  isEligibleApprovedAnchorLocation,
  locationDisplayName,
} from "./locationMapping";
import { normalizeAnchorText, normalizeAliasList } from "./normalize";
import type {
  AnchorResolution,
  AnchorResolutionSource,
  ResolvedAnchor,
} from "./types";

function rowImage(row: any) {
  return (
    row.image