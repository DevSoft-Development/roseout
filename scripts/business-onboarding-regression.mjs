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
