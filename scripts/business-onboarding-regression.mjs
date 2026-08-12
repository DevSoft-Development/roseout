import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [
  [
    "live search is debounced and abortable",
    read("components/business/BusinessLocationLookup.tsx"),
    /setTimeout\(async \(\) =>/,
    /AbortController/,
    /300/,
  ],
  [
    "claim submission requires account identity",
    read("app/api/business/claim/no-code/route.ts"),
    /auth_required/,
    /email_must_match_account/,
    /selectedLocationId/,
    /location_already_claimed/,
    /email_verification_required/,
    /active_claim_limit/,
    /claim_rate_limited/,
    /ownership_attested/,
  ],
  [
    "new approvals create an unpublished canonical location",
    read("lib/locations/claims.ts"),
    /findOrCreateCanonicalLocationForClaim/,
    /is_searchable: false/,
    /is_hidden: true/,
    /source_table: "location_claim_requests"/,
  ],
  [
    "signup preserves business claim destination",
    read("app/login/page.tsx"),
    /const intendedRoute = sanitizeIntendedPath/,
    /next: intendedRoute/,
  ],
  [
    "claim details wait for account verification",
    read("app/business/claim/no-code/page.tsx"),
    /locationPathChosen && canCompleteClaim/,
    /mode=new/,
    /encodeURIComponent\(claimReturnPath\)/,
  ],
  [
    "email verification preserves business claim destination",
    read("app/auth/verify-email/page.tsx") + read("app/auth/verified/page.tsx"),
    /sanitizeIntendedPath/,
    /metadata\.next/,
    /login\?next=/,
  ],
  [
    "location search is deliberately narrow",
    read("app/api/business/onboarding/location-search/route.ts"),
    /query\.length < 3/,
    /slice\(0, 6\)/,
    /private, no-store/,
  ],
  [
    "approval routes Partner Pro owners to billing",
    read("app/api/admin/claims/update/route.ts"),
    /plan_interest === "pro"/,
    /business\/dashboard\/billing\?location=/,
    /plan_interval === "annual"/,
  ],
];

let failed = 0;
for (const [name, source, ...patterns] of checks) {
  const ok = patterns.every((pattern) => pattern.test(source));
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

process.exit(failed ? 1 : 0);
