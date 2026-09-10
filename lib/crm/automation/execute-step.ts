import "server-only";
import type { AutomationSettings, ClaimedStep, StepOutcome } from "./types";
import { AutomationError } from "./errors";
import { calculateWaitUntil } from "./wait-time";
import { executeEmailStep, executeExitCheckStep, executeTaskStep } from "./adapters";

export async function executeStep(step: ClaimedStep, settings: AutomationSettings): Promise<StepOutcome> {
  switch (step.step_type) {
    case "wait":
      return { status: "completed", nextStepAt: calculateWaitUntil(step.step_config).toISOString() };
    case "email":
      return executeEmailStep(step, settings);
    case "task":
      return executeTaskStep(step, settings);
    case "manual_review":
      return { status: "pending_approval", result: { reason: "manual_review_required" } };
    case "internal_notification":
      return { status: "completed" };
    case "exit_check":
      return executeExitCheckStep(step);
    default:
      throw new AutomationError("UNSUPPORTED_STEP", `Unsupported step type: ${step.step_type}`, false, "unsupported");
  }
}
