export function boundedConfidence(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
