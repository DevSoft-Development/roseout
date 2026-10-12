import { buildBusinessEntryQuery, parseBusinessEntryIntent } from "./entry-intent";

/** Never accept an arbitrary cross-origin redirect from a signup query. */
export function getBusinessEntryReturnPath(query: string): string {
  const normalized = parseBusinessEntryIntent(new URLSearchParams(query.replace(/^\?/, "")));
  return `/business/onboarding?${buildBusinessEntryQuery(normalized)}`;
}

/** Reconstruct a canonical post-auth URL rather than trusting a redirect input. */
export function getBusinessAuthRedirect(query: string): string {
  const intended = getBusinessEntryReturnPath(query);
  return `/business/login?next=${encodeURIComponent(intended)}`;
}
