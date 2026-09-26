import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Azure consumer central credential authority", () => {
  it("sources provider configuration from the Admin Credential Vault instead of duplicate GitHub secrets", () => {
    const workflow = read(".github/workflows/azure-consumer-runtime.yml");

    expect(workflow).toContain("/theouthaven/credential-vault/staging");
    expect(workflow).toContain('aws secretsmanager get-secret-value --secret-id "$PREFIX/supabase"');
    expect(workflow).toContain('aws secretsmanager get-secret-value --secret-id "$PREFIX/huggingface"');
    expect(workflow).not.toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(workflow).not.toContain("secrets.HUGGINGFACE_AI_TOKEN");
    expect(workflow).not.toContain("vars.HUGGINGFACE_AI_MODEL");
  });

  it("keeps Hugging Face fallback settings managed by the central provider catalog", () => {
    const catalog = read("apps/admin/lib/admin/credential-vault-catalog.ts");
    expect(catalog).toContain('{ key: "token", label: "Access token", secret: true }');
    expect(catalog).toContain('{ key: "aiEndpoint", label: "AI fallback endpoint"');
    expect(catalog).toContain('{ key: "aiModel", label: "AI fallback model"');
  });
});
