export type SearchTrace = {
  requestId: string;
  planVersion: string;
  timing: Record<"plannerMs"|"retrievalMs"|"roleAssignmentMs"|"scoringMs"|"pairingMs"|"fallbackMs"|"validationMs"|"serializationMs"|"totalMs", number>;
  counts: { retrieved: number; restaurantQualified: number; activityQualified: number; dualRoleQualified: number; pairsBuilt: number; pairsValid: number; displayed: number };
  retrievalCalls: Array<{ role: string; reason: string; durationMs: number; resultCount: number }>;
  decisions: Array<{ stage: string; decision: string; reason: string }>;
  rejections: {
    retrievalRpcEmpty: number;
    strictGeo: number;
    missingCoordinates: number;
    familySafety: number;
    dinnerEvidence: number;
    weakActivityIntent: number;
    roleAssignment: number;
  };
  fallback: { used: boolean; reason: string | null };
  ml: { enabled: boolean; modelVersion: string | null; phase1Enabled: boolean; phase2Enabled: boolean; rankingVariant: string | null; rolloutBucket: number | null };
};

export function createSearchTrace(requestId: string): SearchTrace {
  return {
    requestId,
    planVersion: "search-plan-v1",
    timing: { plannerMs:0,retrievalMs:0,roleAssignmentMs:0,scoringMs:0,pairingMs:0,fallbackMs:0,validationMs:0,serializationMs:0,totalMs:0 },
    counts: { retrieved:0,restaurantQualified:0,activityQualified:0,dualRoleQualified:0,pairsBuilt:0,pairsValid:0,displayed:0 },
    retrievalCalls: [],
    decisions: [],
    rejections: { retrievalRpcEmpty:0, strictGeo:0, missingCoordinates:0, familySafety:0, dinnerEvidence:0, weakActivityIntent:0, roleAssignment:0 },
    fallback:{used:false,reason:null},
    ml:{enabled:false,modelVersion:null,phase1Enabled:false,phase2Enabled:false,rankingVariant:null,rolloutBucket:null},
  };
}

export function recordTiming(trace: SearchTrace, key: keyof SearchTrace["timing"], started: number) {
  trace.timing[key] = Math.max(0, performance.now() - started);
}
