import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assistantApi = readFileSync("infra/aws/lambda/platform_assistant_api.py", "utf8");

describe("assistant upstream diagnostics contract", () => {
  it("classifies transient OpenAI network failures without exposing raw exception detail", () => {
    expect(assistantApi).toContain('return RuntimeError("openai_timeout")');
    expect(assistantApi).toContain('return RuntimeError("openai_dns_unavailable")');
    expect(assistantApi).toContain('return RuntimeError("openai_network_unavailable")');
    expect(assistantApi).toContain('"diagnostic_code": diagnostic_code');
    expect(assistantApi).toContain('"request_id": request_id');
    expect(assistantApi).not.toContain('"detail": str(exc)');
  });

  it("classifies provider secret and AWS failures into safe operational codes", () => {
    expect(assistantApi).toContain('return "provider_secret_access_denied"');
    expect(assistantApi).toContain('return "provider_secret_not_found"');
    expect(assistantApi).toContain('return "provider_secret_throttled"');
    expect(assistantApi).toContain('return "aws_endpoint_unavailable"');
    expect(assistantApi).toContain('return "aws_timeout"');
  });

  it("keeps the public error generic while returning the safe code as a diagnostic header", () => {
    expect(assistantApi).toContain('"assistant_upstream_unavailable"');
    expect(assistantApi).toContain('extra_headers={"x-toh-error-code": diagnostic_code}');
  });
});
