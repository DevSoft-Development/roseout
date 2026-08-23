import { describe, expect, it } from "vitest";
import { validateNewYorkHiringText, validateNewYorkJobPosting } from "../new-york-compliance";

const paidJob = {
  status: "open",
  title: "Experience Team Associate",
  summary: "Support guests and business owners through documented support workflows.",
  responsibilities: "Resolve support requests and document outcomes.",
  is_paid: true,
  compensation_type: "hourly",
  compensation_min: 22,
  compensation_max: 28,
  compensation_text: "$22-$28 per hour",
};

describe("New York career posting compliance", () => {
  it("allows an open paid role with a good-faith pay range", () => {
    expect(validateNewYorkJobPosting(paidJob)).toBeNull();
  });

  it("allows a fixed rate when min and max are equal", () => {
    expect(validateNewYorkJobPosting({ ...paidJob, compensation_min: 25, compensation_max: 25 })).toBeNull();
  });

  it("blocks an open paid role without a pay range", () => {
    const issue = validateNewYorkJobPosting({ ...paidJob, compensation_min: null, compensation_max: null });
    expect(issue?.key).toBe("pay_range");
  });

  it("allows a clearly disclosed unpaid educational role", () => {
    const issue = validateNewYorkJobPosting({
      ...paidJob,
      is_paid: false,
      compensation_type: "unpaid",
      compensation_min: null,
      compensation_max: null,
      compensation_text: "Unpaid educational / college-credit internship",
    });
    expect(issue).toBeNull();
  });

  it("allows a clearly disclosed commission role", () => {
    const issue = validateNewYorkJobPosting({
      ...paidJob,
      compensation_type: "commission",
      compensation_min: null,
      compensation_max: null,
      compensation_text: "Commission-based compensation",
    });
    expect(issue).toBeNull();
  });

  it("does not publish a job ad that asks for salary history", () => {
    const issue = validateNewYorkJobPosting({ ...paidJob, requirements: "Provide your salary history." });
    expect(issue?.key).toBe("salary_history");
  });

  it("does not publish a job ad with pre-offer criminal-history language", () => {
    const issue = validateNewYorkJobPosting({ ...paidJob, hiring_process: "A background check will be part of the hiring process." });
    expect(issue?.key).toBe("criminal_history");
  });

  it("does not publish a job ad with consumer-credit screening language", () => {
    const issue = validateNewYorkJobPosting({ ...paidJob, hiring_process: "A credit report will be reviewed." });
    expect(issue?.key).toBe("credit_history");
  });

  it("permits incomplete draft jobs to be saved without publishing them", () => {
    expect(validateNewYorkJobPosting({ status: "draft", title: "Draft role" })).toBeNull();
  });
});

describe("New York hiring record safeguards", () => {
  it("blocks current or prior compensation from decision notes", () => {
    expect(validateNewYorkHiringText("Candidate's current salary is $70,000")?.key).toBe("current_salary");
  });

  it("blocks protected-trait information from decision notes", () => {
    expect(validateNewYorkHiringText("Candidate discussed their pregnancy during the interview")?.key).toBe("protected_trait");
  });

  it("blocks medical information from scorecard notes", () => {
    expect(validateNewYorkHiringText("Candidate disclosed a medical condition")?.key).toBe("medical");
  });

  it("blocks pre-offer criminal-history information", () => {
    expect(validateNewYorkHiringText("Candidate has a prior conviction")?.key).toBe("criminal_history");
  });

  it("allows ordinary job-related evidence", () => {
    expect(validateNewYorkHiringText("Candidate gave a clear support example and met the required schedule.")).toBeNull();
  });
});
