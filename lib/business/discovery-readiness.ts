/** Pure free-listing setup calculation. Does not grant publication or ownership. */
export type DiscoveryStep = Readonly<{ key: string; status: "complete" | "needs_setup" | "skipped"; optional: boolean }>;

export function getDiscoveryReadiness(steps: readonly DiscoveryStep[]) {
  const required = steps.filter(step => !step.optional);
  const requiredComplete = required.length > 0 && required.every(step => step.status === "complete");
  return {
    discoveryReady: requiredComplete,
    nextRequiredStep: required.find(step => step.status !== "complete")?.key ?? null,
    readinessPercent: Math.round((steps.filter(step => step.status !== "needs_setup").length / Math.max(steps.length, 1)) * 100),
    completionPercent: Math.round((steps.filter(step => step.status === "complete").length / Math.max(steps.length, 1)) * 100),
  };
}
