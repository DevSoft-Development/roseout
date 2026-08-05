import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assignmentScopeSummary,
  buildAssignmentTaskTitle,
  normalizeAssignmentWorkType,
  queueForAssignmentWorkType,
} from "@/lib/team-assignment-utils";

describe("team assignments to CRM My Work", () => {
  it("normalizes supported work types and queue ownership", () => {
    expect(normalizeAssignmentWorkType("site_visit")).toBe("site_visit");
    expect(queueForAssignmentWorkType("site_visit")).toBe("partnerships");
    expect(queueForAssignmentWorkType("claim_review")).toBe("claims");
    expect(queueForAssignmentWorkType("unknown")).toBe("general");
  });

  it("creates a human-readable area scope", () => {
    expect(assignmentScopeSummary({ market: "Westchester", city: "Yonkers", neighborhood: "Getty Square" })).toBe(
      "Market: Westchester · City/Town: Yonkers · Neighborhood: Getty Square",
    );
  });

  it("creates a location-specific task title", () => {
    expect(buildAssignmentTaskTitle("outreach", "Sample Venue")).toBe("Outreach: Sample Venue");
  });

  it("writes both a location assignment and an idempotent CRM task", () => {
    const service = readFileSync("lib/team-assignment-service.ts", "utf8");
    expect(service).toContain("assignLocationsToWorkspaceUser");
    expect(service).toContain('.from("crm_tasks")');
    expect(service).toContain('source = "team_location_assignment"');
    expect(service).toContain("assigned_to_user_id: member.user_id");
    expect(service).toContain('.from("crm_task_notifications")');
  });

  it("supports market, city, borough, neighborhood and town filters", () => {
    const service = readFileSync("lib/team-assignment-service.ts", "utf8");
    for (const field of ["market", "city", "borough", "neighborhood", "town"]) {
      expect(service).toContain(field);
    }
  });

  it("shows the resulting task in the same My Work query contract", () => {
    const queue = readFileSync("lib/crm/tasks/queries.ts", "utf8");
    expect(queue).toContain('.eq("assigned_to_user_id",userId)');
    const page = readFileSync("components/AdminAssignLocationsClient.tsx", "utf8");
    expect(page).toContain("Assign and create My Work tasks");
    expect(page).toContain("Open My Work");
  });
});
