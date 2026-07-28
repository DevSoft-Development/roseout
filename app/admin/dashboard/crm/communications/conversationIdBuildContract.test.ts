import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/admin/dashboard/crm/communications/actions.ts"),
  "utf8",
);

describe("CRM conversation ID build contract", () => {
  it("never sends the nullable conversationId variable to Resend", () => {
    expect(source).toContain(
      "const resolvedConversationId = await getOrCreateConversation",
    );
    expect(source).toContain("conversation_id: resolvedConversationId");
    expect(source).toContain("value: resolvedConversationId");
    expect(source).not.toMatch(
      /name:\s*["']crm_conversation_id["'][\s\S]{0,160}value:\s*conversationId\b/,
    );
  });
});
