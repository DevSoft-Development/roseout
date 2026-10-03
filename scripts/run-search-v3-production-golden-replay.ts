import fs from "node:fs";
import path from "node:path";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createTheOutHavenSearchV3, type TheOutHavenSearchV3Client } from "@/lib/search/v3";
import { GOLDEN_SEARCH_QUERIES } from "@/lib/search/quality/goldenQueries";
import { buildV3ReplayMetrics, evaluateV3Execution, snapshotV3Execution } from "@/lib/search/quality/v3ReplayEvaluation";

type Row = {
  id: string;
  query: string;
  category: string;
  passed: boolean;
  error: string | null;
  comparison: ReturnType<typeof evaluateV3Execution> | null;
  execution: ReturnType<typeof snapshotV3Execution> | null;
};

async function main() {
  const outDir = process.env.SEARCH_V3_REPLAY_OUT_DIR || "artifacts";
  fs.mkdirSync(outDir, { recursive: true });

  const v3 = createTheOutHavenSearchV3(
    supabaseAdmin as unknown as TheOutHavenSearchV3Client,
  );

  const rows: Row[] = [];

  for (const testCase of GOLDEN_SEARCH_QUERIES) {
    const startedAt = Date.now();
    try {
      const execution = await v3.orchestrator.execute({
        requestId: `production-golden:${Date.now()}:${testCase.id}`,
        query: testCase.query,
        limit: 20,
      });

      const comparison = evaluateV3Execution(testCase, execution, {
        legacyCount: 0,
        latencyMs: Date.now() - startedAt,
      });

      rows.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        passed: comparison.passed,
        error: null,
        comparison,
        execution: snapshotV3Execution(execution),
      });

      console.log(
        JSON.stringify({
          id: testCase.id,
          passed: comparison.passed,
          resultCount: comparison.resultCount,
          pairCount: comparison.pairCount,
          exactDomainCoveragePass: comparison.exactDomainCoveragePass,
          geographyPass: comparison.geographyPass,
          pairRelevancePass: comparison.pairRelevancePass,
          pairTravelTimePass: comparison.pairTravelTimePass,
          pairRouteVerifiedPass: comparison.pairRouteVerifiedPass,
          latencyMs: comparison.latencyMs,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({
        id: testCase.id,
        query: testCase.query,
        category: testCase.category,
        passed: false,
        error: message,
        comparison: null,
        execution: null,
      });
      console.error(JSON.stringify({ id: testCase.id, error: message }));
    }
  }

  const metrics = buildV3ReplayMetrics(
    rows.map((row) => ({
      canonicalPassed: false,
      v3: row.comparison,
      contractFailure: Boolean(row.error),
    })),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "production",
    queryCount: GOLDEN_SEARCH_QUERIES.length,
    metrics,
    failures: rows
      .filter((row) => !row.passed)
      .map((row) => ({
        id: row.id,
        query: row.query,
        error: row.error,
        comparison: row.comparison,
      })),
    rows,
  };

  const reportPath = path.join(outDir, "search-v3-golden-replay.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\nSearch V3 production golden replay");
  console.log(JSON.stringify(metrics, null, 2));
  console.log(`Report: ${reportPath}`);

  if (metrics.contractFailureCount > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
