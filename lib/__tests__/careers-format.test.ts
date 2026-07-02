import { describe, expect, it } from "vitest";
import { formatCareerStage, getCompensationLabel, requiresInternshipComplianceChecklist } from "@/lib/careers/format";
import { isDuplicateApplicationError } from "@/lib/careers/actions";

describe("careers helpers", () => {
  it("uses applicant-friendly public stage labels", () => {
    expect(formatCareerStage("not_selected")).toBe("No Longer Moving Forward");
  });

  it("detects duplicate application errors", () => {
    expect(isDuplicateApplicationError("duplicate key value violates unique constraint")).toBe(true);
  });

  it("requires compliance for educational internship tracks", () => {
    expect(requiresInternshipComplianceChecklist({ is_internship: true, internship_type: "college_credit", is_paid: false })).toBe(true);
  });

  it("formats educational compensation language", () => {
    expect(getCompensationLabel({ internship_type: "college_credit", is_paid: false })).toBe("Educational / College Credit");
  });
});
