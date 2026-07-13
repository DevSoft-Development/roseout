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
  intent: Record<string, any>;
  result: Record<string, any>;
  results: any[];
  restaurants: any[];
  activities: any[];
  pairs: any[];
  topResults: any[];
  resultCount: number;
  expectedAudience: string | null;
  detectedAudience: string | null;
  requestedDomain: string | null;
  actualPrimaryDomain: string | null;
  requestedGeo: Record<string, unknown>;
  performance: Record<string, number | null>;
};

export type SearchQualityEvaluation = {
  technicalSuccess: boolean;
  qualitySuccess: boolean;
  hadIssue: boolean;
  severity: SearchQualitySeverity;
  issueType: string | null;
  issueLabel: string | null;
  suspiciousFlags: string[];
  findings: SearchQualityFinding[];
  metrics: Record<string, number | string | boolean | null>;
};

export type SearchQualityRule = (context: SearchQualityContext) => SearchQualityFinding[];
