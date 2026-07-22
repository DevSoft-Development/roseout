import { after } from "next/server";

function runSafely(
  requestId: string,
  operation: string,
  run: () => Promise<unknown> | unknown,
) {
  Promise.resolve()
    .then(run)
    .catch((error) => {
      console.error("[api/generate] noncritical operation failed", {
        requestId,
        operation,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

export function scheduleNoncriticalOperation(
  requestId: string,
  operation: string,
  run: () => Promise<unknown> | unknown,
) {
  try {
    after(() => runSafely(requestId, operation, run));
  } catch {
    runSafely(requestId, operation, run);
  }
}
