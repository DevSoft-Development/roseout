export type SearchQualitySeverity = "info" | "low" | "medium" | "high" | "critical";
export type SearchQualityCategory = "audience" | "intent" | "domain" | "geo" | "pairing" | "ranking" | "data_quality" | "performance";
export type SearchQualityFinding = {
  flag: string;
  category: SearchQualityCategory;
  severity: SearchQualitySeverity;
  message: string;
  evidence?: Record<string, unknown>;
  affectedResultIds?: Array<string | number>;
  recommendedAction?: string;
};
export type SearchQualityContext = {
  query: string;
  intent: any;
