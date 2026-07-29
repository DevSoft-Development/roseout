export type SearchQualityMetrics = {
  total: number;
  successRate: number;
  wrongDomainRate: number;
  geographyLeakageRate: number;
  pairedQuerySuccessRate: number;
  noResultRegressionRate: number;
  legacyFallbackRate: number;
  p95LatencyMs: number;
  contractFailureCount: number;
};

export type LaunchGate = {
  key: keyof SearchQualityMetrics;
  label: string;
  operator: 'min' | 'max' | 'zero';
  target: number;
  actual: number;
  passed: boolean;
  critical: boolean;
};

export function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

export function buildLaunchGates(metrics: SearchQualityMetrics): LaunchGate[] {
  const definitions: Array<Omit<LaunchGate, 'actual' | 'passed'>> = [
    { key: 'successRate', label: 'Supported-query success', operator: 'min', target: 99.5, critical: true },
    { key: 'wrongDomainRate', label: 'Wrong-domain rate', operator: 'max', target: 2, critical: true },
    { key: 'geographyLeakageRate', label: 'Geography leakage', operator: 'max', target: 1, critical: true },
    { key: 'pairedQuerySuccessRate', label: 'Paired-query success', operator: 'min', target: 85, critical: true },
    { key: 'noResultRegressionRate', label: 'Canonical no-result regression', operator: 'max', target: 2, critical: true },
    { key: 'legacyFallbackRate', label: 'Legacy fallback usage', operator: 'max', target: 10, critical: false },
    { key: 'p95LatencyMs', label: 'P95 latency', operator: 'max', target: 3000, critical: true },
    { key: 'contractFailureCount', label: 'Response contract failures', operator: 'zero', target: 0, critical: true },
  ];
  return definitions.map((definition) => {
    const actual = Number(metrics[definition.key]);
    const passed = definition.operator === 'min' ? actual >= definition.target : definition.operator === 'max' ? actual <= definition.target : actual === 0;
    return { ...definition, actual, passed };
  });
}

export function canIncreaseProfileRollout(metrics: SearchQualityMetrics) {
  const gates = buildLaunchGates(metrics);
  return { allowed: gates.filter((gate) => gate.critical).every((gate) => gate.passed), gates };
}
