import assert from "node:assert/strict";
import test from "node:test";
import { classifyChangedFiles } from "./ci-service-domains.mjs";

test("mobile-only changes do not require the shared web build", () => {
  const result = classifyChangedFiles(["mobile/app/index.tsx"]);
  assert.equal(result.mobile, true);
  assert.equal(result.web, false);
  assert.equal(result.admin, false);
  assert.equal(result.business, false);
  assert.equal(result.reserve, false);
});

test("AWS-only changes stay out of the shared web build", () => {
  const result = classifyChangedFiles(["infra/aws/platform-dr/template.yml"]);
  assert.equal(result.infrastructure, true);
  assert.equal(result.web, false);
});

test("admin changes are classified as admin web work", () => {
  const result = classifyChangedFiles(["app/admin/dashboard/page.tsx"]);
  assert.equal(result.admin, true);
  assert.equal(result.web, true);
  assert.equal(result.business, false);
});

test("business dashboard changes are isolated from admin and reserve", () => {
  const result = classifyChangedFiles(["app/locations/dashboard/page.tsx"]);
  assert.equal(result.business, true);
  assert.equal(result.web, true);
  assert.equal(result.admin, false);
  assert.equal(result.reserve, false);
});

test("reserve changes trigger reserve web validation", () => {
  const result = classifyChangedFiles(["lib/reservations/availability.ts"]);
  assert.equal(result.reserve, true);
  assert.equal(result.web, true);
});

test("shared auth changes fan out across protected web surfaces", () => {
  const result = classifyChangedFiles(["lib/auth/session.ts"]);
  assert.equal(result.shared, true);
  assert.equal(result.admin, true);
  assert.equal(result.business, true);
  assert.equal(result.reserve, true);
  assert.equal(result.consumer, true);
  assert.equal(result.web, true);
});

test("background runtime changes trigger workers without forcing the web build", () => {
  const result = classifyChangedFiles(["infra/aws/background-runtime/template.yml"]);
  assert.equal(result.workers, true);
  assert.equal(result.infrastructure, true);
  assert.equal(result.web, false);
});

test("documentation-only changes are explicitly identified", () => {
  const result = classifyChangedFiles(["docs/architecture.md", "README.md"]);
  assert.equal(result.docs_only, true);
  assert.equal(result.web, false);
  assert.equal(result.mobile, false);
  assert.equal(result.infrastructure, false);
});
