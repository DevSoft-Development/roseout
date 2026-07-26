import { after } from "next/server";

async function runSafely(
  requestId: string,
  operation: string,
  run: () => Promise<unknown> | unknown,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error("[api/generate] noncritical operation failed", {
      requestId,
      operation,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleNoncriticalOperation(
  requestId: string,
  operation: string,
  run: () => Promise<unknown> | unknown,
) {
  try {
    after(async () => {
      await runSafely(requestId, operation, run);
    });
  } catch {
    void runSafely(requestId, operation, run);
  }
}