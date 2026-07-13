import { highestSeverity, isQualityFailure } from "./severity";
import type { SearchQualityContext, SearchQualityEvaluation, SearchQualityRule } from "./types";

export function createSearchQualityEvaluator(rules: SearchQualityRule[] = []) {
  return (context: SearchQualityContext): SearchQualityEvaluation => {
    const findings = rules.flatMap((rule) => {
      try {
        return rule(context);
      } catch {
        return [];
      }
    });
    const severity = highestSeverity(findings);
    const primary = [...findings].sort((a, b) =>
      ["info", "low", "medium", "high", "critical"].indexOf(b.severity) -
      ["info", "low", "medium", "high", "critical"].indexOf(a.severity),
    )[0];
    const technicalSuccess = context.resultCount > 0 && context.result?.success !== false;

    return {
      technicalSuccess,
      qualitySuccess: technicalSuccess && !isQualityFailure(severity),
      hadIssue: findings.length > 0,
      severity,
      issueType: primary?.category ?? null,
      issueLabel: primary?.message ?? null,
      suspiciousFlags: [...new Set(findings.map((finding) => finding.flag))],
      findings,
      metrics: { resultCount: context.resultCount },
    };
  };
}

export const evaluateSearchQualityScaffold = createSearchQualityEvaluator([]);
