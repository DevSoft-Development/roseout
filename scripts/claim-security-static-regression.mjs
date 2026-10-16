import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths = [
  "apps/business/app/api/business/claim-code/link-account/route.ts",
  "app/api/business/claim-code/link-account/route.ts",
];
for (const path of paths) {
  const src = readFileSync(path, "utf8");
  assert.doesNotMatch(src, /if\\s*\\(challenge\\.contact_match\\s*&&\\s*!approved\\)/, path + ": weak contact-match must not auto-approve ownership");
  assert.doesNotMatch(src, /approveLocationClaim\\s*\\(/, path + ": account linking must not grant ownership");
  assert.match(src, /claim\\.verified_contact\\s*!==\\s*challenge\\.contact_normalized/, path + ": missing contact binding");
  assert.match(src, /claim\\.verified_contact_channel\\s*!==\\s*challenge\\.channel/, path + ": missing channel binding");
  assert.match(src, /verification_expired/, path + ": missing expiry check");
  assert.match(src, /\\.is\\("user_id", null\\)/, path + ": missing conditional claimant association");
}
const notifications = readFileSync("lib/notifications.ts", "utf8");
assert.match(notifications, /TheOutHaven Tech Assistant/, "Missing approved Tech Assistant identity");
const policy = readFileSync("lib/business-claim/methodPolicy.ts", "utf8");
assert.match(policy, /requiresOwnershipReview: true/, "Method selection must not grant authorization");
assert.match(policy, /source_type","official_website"/, "Email source provenance filter is required");
console.log("Claim security static regression passed. Integration and concurrency certification still required.");

const web = readFileSync("lib/business-claim/websiteToken.ts","utf8");
assert.match(web,/lookup:/,"Website verifier must pin its vetted DNS resolution");
assert.match(web,/blocked\.check/,"Website verifier must reject unsafe IP ranges");
assert.match(web,/statusCode!==200/,"Website verifier must not follow redirects");
assert.match(web,/body\.length>2048/,"Website verification response size must be bounded");
const domain = readFileSync("apps/business/app/api/business/claim/domain/route.ts","utf8");
assert.match(domain,/fetchOfficialWebsiteToken/,"Website verification must use vetted fetch");
const welcome = readFileSync("lib/business-claim/welcomeOnce.ts","utf8");
assert.match(welcome,/ignoreDuplicates:true/,"Welcome delivery must use conflict-safe reservation");
const review = readFileSync("apps/admin/app/api/admin/claims/video-review/route.ts","utf8");
assert.match(review,/requireAdminApiRole/,"Video evidence access requires admin authorization");
