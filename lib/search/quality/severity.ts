import type { SearchQualityFinding, SearchQualitySeverity } from "./types";

const ORDER: SearchQualitySeverity[] = ["info", "low", "medium", "high", "critical"];

export function highestSeverity(findings: SearchQualityFinding[]): SearchQualitySeverity {
  return findings.reduce<SearchQualitySeverity>((current, finding) =>
    ORDER.indexOf(finding.severity) > ORDER.indexOf(current) ? finding.severity : current,
  "info");
}

export function isQualityFailure(severity: SearchQualitySeverity) {
  return severity === "high" || severity === "critical";
}
