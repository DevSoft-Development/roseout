import { getSearchSpeedStatus } from "../lib/search/performance";
const cases = [
  ["500ms", getSearchSpeedStatus({ totalMs: 500 }), "fast"],
  ["1500ms", getSearchSpeedStatus({ totalMs: 1500 }), "good"],
  ["3000ms", getSearchSpeedStatus({ totalMs: 3000 }), "slow"],
  ["7000ms", getSearchSpeedStatus({ totalMs: 7000 }), "critical"],
  ["success false", getSearchSpeedStatus({ totalMs: 500, success: false }), "failed"],
  ["timedOut true", getSearchSpeedStatus({ totalMs: 500, timedOut: true }), "timeout"],
] as const;
for (const [label, actual, expected] of cases) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
console.log("Beta search performance status checks passed.");
