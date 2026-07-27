import type { EnterpriseLocation } from "./types";

export type ActivityQualification = {
  matches: boolean;
  role: string | null;
  explicitMatches: string[];
  strongMatches: string[];
  rejectedGenericMatches: string[];
  reason: string;
};

const fields = (candidate: EnterpriseLocation) =>
  [
    candidate.name,
    candidate.restaurant_name,
    candidate.activity_name,
    candidate.activity_type,
    candidate.primary_category,
    candidate.description,
    ...(Array.isArray(candidate.tags) ? candidate.tags : []),
    ...(Array.isArray(candidate.semantic_tags) ? candidate.semantic_tags : []),
    ...(Array.isArray(candidate.intent_tags) ? candidate.intent_tags : []),
    ...(Array.isArray(candidate.search_keywords) ? candidate.search_keywords : []),
    candidate.search_document,
    candidate.semantic_search_text,
  ].filter(Boolean).join(" ").toLowerCase();

function evaluate(
  candidate: EnterpriseLocation,
  role: string,
  explicit: RegExp[],
  strong: RegExp[],
  generic: RegExp[],
): ActivityQualification {
  const haystack = fields(candidate);
  const explicitMatches = explicit.filter((term) => term.test(haystack)).map(String);
  const strongMatches = strong.filter((term) => term.test(haystack)).map(String);
  const rejectedGenericMatches = generic.filter((term) => term.test(haystack)).map(String);
  const matches = explicitMatches.length > 0 || strongMatches.length > 0;
  return {
    matches,
    role: matches ? role : null,
    explicitMatches,
    strongMatches,
    rejectedGenericMatches,
    reason: matches ? `qualified_${role}_evidence` : `missing_strong_${role}_evidence`,
  };
}

const GENERIC_BAR = [/\bbar\b/i, /\blounge\b/i, /\bpub\b/i, /\btavern\b/i];

export function qualifySportsWatchCandidate(candidate: EnterpriseLocation) {
  return evaluate(candidate, "sports_watch",
    [/\bsports? bar\b/i, /\bsports? lounge\b/i],
    [/\blive sports\b/i, /\bwatch party\b/i, /\bgame day\b/i, /\bbar with tvs?\b/i, /\bbig screens?\b/i, /\bsports viewing\b/i],
    GENERIC_BAR);
}

export function qualifyHookahCandidate(candidate: EnterpriseLocation) {
  return evaluate(candidate, "hookah",
    [/\bhookah (?:lounge|bar)\b/i, /\bshisha (?:lounge|bar)\b/i],
    [/\bhookah\b/i, /\bshisha\b/i], GENERIC_BAR);
}

export function qualifyKaraokeCandidate(candidate: EnterpriseLocation) {
  return evaluate(candidate, "karaoke",
    [/\bprivate karaoke\b/i, /\bkaraoke (?:bar|lounge|room|venue)\b/i],
    [/\bkaraoke\b/i, /\bsing[ -]along venue\b/i], GENERIC_BAR);
}

export function qualifyRooftopCandidate(candidate: EnterpriseLocation) {
  return evaluate(candidate, "rooftop",
    [/\brooftop(?: bar| restaurant| dining)?\b/i, /\broof[ -]?deck\b/i, /\broof top\b/i],
    [/\bterrace bar\b/i, /\bskyline rooftop\b/i, /\bskyline terrace\b/i],
    [/\bbar\b/i, /\blounge\b/i, /\bviews?\b/i, /\boutdoor seating\b/i, /\bpatio\b/i, /\bterrace\b/i]);
}

export function qualifyRelaxedActivity(candidate: EnterpriseLocation) {
  if (/\b(nightclub|night club|adult[- ]only|strip club)\b/i.test(fields(candidate))) {
    return { matches: false, role: null, explicitMatches: [], strongMatches: [], rejectedGenericMatches: ["nightlife_exclusion"], reason: "excluded_nightlife_for_relaxed_intent" };
  }
  return evaluate(candidate, "relaxed_activity",
    [/\bbowling\b/i, /\bbilliards?\b/i, /\bpool hall\b/i, /\bmini golf\b/i, /\bmuseum\b/i, /\bart gallery\b/i, /\bscenic walk\b/i, /\bpark\b/i, /\bboard games?\b/i, /\bpaint and sip\b/i, /\blow[ -]key live music\b/i],
    [], [/\bnightclub\b/i, /\bnight club\b/i, /\badult[- ]only\b/i, /\blounge\b/i]);
}

export function qualifyRecoveredActivity(
  candidate: EnterpriseLocation,
  requestedTerms: string[],
): ActivityQualification {
  const terms = requestedTerms.join(" ").toLowerCase();
  if (/karaoke/.test(terms)) return qualifyKaraokeCandidate(candidate);
  if (/hookah|shisha/.test(terms)) return qualifyHookahCandidate(candidate);
  if (/sports|watch|knicks|game/.test(terms)) return qualifySportsWatchCandidate(candidate);
  if (/rooftop|roof|terrace|skyline/.test(terms)) return qualifyRooftopCandidate(candidate);
  if (/relax|bowling|billiard|museum|gallery|park|mini golf|board game/.test(terms))
    return qualifyRelaxedActivity(candidate);
  return { matches: false, role: null, explicitMatches: [], strongMatches: [], rejectedGenericMatches: [], reason: "no_supported_recovery_role" };
}
