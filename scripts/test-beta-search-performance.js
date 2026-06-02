function getSearchSpeedStatus(input) {
  if (input.timedOut) return "timeout";
  if (input.success === false) return "failed";
  const totalMs = Number(input.totalMs ?? 0);
  if (totalMs <= 1000) return "fast";
  if (totalMs <= 2500) return "good";
  if (totalMs <= 5000) return "slow";
  return "critical";
}
const cases = [["500ms", { totalMs: 500 }, "fast"], ["1500ms", { totalMs: 1500 }, "good"], ["3000ms", { totalMs: 3000 }, "slow"], ["7000ms", { totalMs: 7000 }, "critical"], ["success false", { totalMs: 500, success: false }, "failed"], ["timedOut true", { totalMs: 500, timedOut: true }, "timeout"]];
for (const [label, input, expected] of cases) { const actual = getSearchSpeedStatus(input); if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`); }
console.log("Beta search performance status checks passed.");
