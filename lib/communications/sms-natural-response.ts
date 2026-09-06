export type SmsDecisionContext =
  | "generic"
  | "reservation_cancel"
  | "reservation_change"
  | "booking"
  | "attendance"
  | "review_consent";

function normalize(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

const GENERIC_NEGATIVE = [
  /^(no|n|nope|nah)\b/,
  /\b(never mind|nevermind|not now|maybe later|rather not|no thanks|leave it alone|leave it as is)\b/,
];

const GENERIC_POSITIVE = [
  /^(yes|y|yeah|yep|yea|sure|ok|okay|absolutely|definitely|please do|go ahead|sounds good|that works|works for me|looks good|perfect|correct|confirmed|do it)\b/,
  /\b(yes please|go ahead with it|that works for me|sounds good to me|go with that|please proceed)\b/,
];

const CONTEXT_PATTERNS: Record<Exclude<SmsDecisionContext, "generic">, { yes: RegExp[]; no: RegExp[] }> = {
  reservation_cancel: {
    yes: [
      /\b(cancel (it|that|this|my reservation)|please cancel|go ahead and cancel|yes cancel|cancel my reservation)\b/,
    ],
    no: [
      /\b(don't cancel|do not cancel|keep it|keep the reservation|keep my reservation|leave the reservation|leave it booked)\b/,
    ],
  },
  reservation_change: {
    yes: [
      /\b(make the change|apply the change|go with that( new)? (time|date|party size)?|use that (time|date)|that new time works|that new date works)\b/,
    ],
    no: [
      /\b(keep my original|keep the original|keep my current|don't change|do not change|leave it as is|leave the reservation as is)\b/,
    ],
  },
  booking: {
    yes: [
      /\b(i|we) (booked|got it booked|have it booked|got that booked)\b/,
      /\b(booked it|all booked|reservation is booked|booking is confirmed)\b/,
    ],
    no: [
      /\b(couldn't book|could not book|didn't book|did not book|wasn't able to book|was not able to book|not booked|couldn't get a reservation|could not get a reservation)\b/,
    ],
  },
  attendance: {
    yes: [
      /\b(i|we) (went|made it|did go|ended up going)\b/,
      /\b(yes we went|yes i went|made it there|ended up going)\b/,
    ],
    no: [
      /\b(didn't go|did not go|couldn't go|could not go|couldn't make it|could not make it|never made it|didn't make it|did not make it|we missed it|i missed it)\b/,
    ],
  },
  review_consent: {
    yes: [
      /\b(i'll do (it|the review)|i will do (it|the review)|happy to|sure i'll review|yes i'll review|send the review|let's do it)\b/,
    ],
    no: [
      /\b(skip (it|the review)|don't want to review|do not want to review|rather not review|no review|not interested in reviewing)\b/,
    ],
  },
};

/**
 * Interprets short human SMS replies while keeping ambiguous free-form text intact.
 * Context-specific negatives run before positives so phrases such as "don't cancel"
 * cannot be mistaken for an affirmative action.
 */
export function interpretSmsDecision(text: string, context: SmsDecisionContext = "generic"): boolean | null {
  const value = normalize(text);
  if (!value) return null;

  if (context !== "generic") {
    const patterns = CONTEXT_PATTERNS[context];
    if (matches(value, patterns.no)) return false;
    if (matches(value, patterns.yes)) return true;
  }

  if (matches(value, GENERIC_NEGATIVE)) return false;
  if (matches(value, GENERIC_POSITIVE)) return true;
  return null;
}

const ORDINALS: Array<[RegExp, number]> = [
  [/\b(first|1st)\b/, 0],
  [/\b(second|2nd)\b/, 1],
  [/\b(third|3rd)\b/, 2],
  [/\b(fourth|4th)\b/, 3],
  [/\b(fifth|5th)\b/, 4],
];

export function parseSmsSelection(text: string, optionCount: number): number | null {
  const value = normalize(text);
  if (!value || optionCount <= 0) return null;

  const numeric = value.match(/^(?:option\s+|reservation\s+|number\s+)?([1-9]\d*)$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    return index >= 0 && index < optionCount ? index : null;
  }

  if (/^(?:the\s+)?(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)(?:\s+(?:one|reservation|option))?$/.test(value)) {
    for (const [pattern, index] of ORDINALS) {
      if (pattern.test(value)) return index < optionCount ? index : null;
    }
  }
  return null;
}

/**
 * Converts only unambiguous conversational continuations to canonical forms used
 * by legacy state machines. Other messages remain verbatim for normal intent routing.
 */
export function canonicalizeNaturalSmsContinuation(text: string) {
  const raw = String(text || "").trim();
  const decision = interpretSmsDecision(raw, "generic");
  if (decision === true) return "YES";
  if (decision === false) return "NO";

  const selection = parseSmsSelection(raw, 5);
  return selection === null ? raw : String(selection + 1);
}
