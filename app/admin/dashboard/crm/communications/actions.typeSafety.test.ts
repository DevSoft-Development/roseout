import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actionsSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/admin/dashboard/crm/communications/actions.ts",
  ),
  "utf8",
);

describe("CRM email conversation ID type safety", () => {
  it("uses a resolved non-null conversation ID for database and Resend writes", () => {
    expect(actionsSource).toContain(
      "const resolvedConversationId = await getOrCreateConversation",
    );
    expect(actionsSource).toContain(
      "conversation_id: resolvedConversationId",
    );
    expect(actionsSource).toContain(
      'name: "crm_conversation_id"',
    );
    expect(actionsSource).toContain(
      "value: resolvedConversationId",
    );
    expect(actionsSource).not.toMatch(
      /name:\s*["']crm_conversation_id["'][\s\S]{0,120}value:\s*conversationId[,\n]/,
    );
  });
});
