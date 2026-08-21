import fs from "node:fs";
import path from "node:path";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Support AI knowledge-first behavior", () => {
  test("uses recent conversation context for knowledge retrieval", () => {
    const source = read("lib/support/ai-responder.ts");
    expect(source).toContain("buildKnowledgeSearchContext");
    expect(source).toContain("slice(-5)");
    expect(source).toContain("loadKnowledge(searchContext)");
  });

  test("ranks the complete public AI-approved KB instead of limiting the database query to five", () => {
    const source = read("lib/support/ai-responder.ts");
    expect(source).toContain('.eq("ai_approved", true)');
    expect(source).toContain(".limit(120)");
    expect(source).toContain("scoreArticle");
    expect(source).toContain(".slice(0, 8)");
  });

  test("keeps routine issues conversational across multiple follow-ups", () => {
    const source = read("lib/support/ai-responder.ts");
    expect(source).toContain("multiple follow-up questions across the conversation");
    expect(source).toContain("Do not give up after one clarification");
    expect(source).toContain("prevented_premature_handoff");
  });

  test("reserves automatic handoff for protected support actions", () => {
    const source = read("lib/support/ai-responder.ts");
    expect(source).toContain("PROTECTED_SUPPORT");
    expect(source).toContain("protected_support_action");
    expect(source).toContain("ownership transfer");
    expect(source).toContain("unauthorized access");
  });

  test("has deterministic category-specific troubleshooting fallbacks", () => {
    const source = read("lib/support/ai-responder.ts");
    expect(source).toContain("routineFallbackQuestion");
    expect(source).toContain("business profile");
    expect(source).toContain("Menu / Packages");
    expect(source).toContain("custom domain");
    expect(source).toContain("party size");
  });

  test("ships broad public and owner support knowledge coverage", () => {
    const migration = read("supabase/migrations/20260821161000_support_ai_comprehensive_kb.sql");
    for (const slug of [
      "support-search-and-outing-planning",
      "support-how-to-claim-business",
      "support-claim-otp-not-received",
      "support-owner-reservation-setup",
      "support-owner-events-create-publish",
      "support-owner-experience-create-publish",
      "support-location-website-content-sync",
      "support-owner-growth-qr-codes",
      "support-owner-messaging",
      "support-owner-analytics",
      "support-ticket-status-lifecycle",
    ]) {
      expect(migration).toContain(slug);
    }
  });
});
