import { describe, expect, it } from "vitest";
import { resolveProductionDeploymentCommit } from "../runtimeDeploymentCommit";

describe("resolveProductionDeploymentCommit", () => {
  it("prefers the Azure runtime SHA in production", () => {
    expect(resolveProductionDeploymentCommit({
      PLATFORM_RUNTIME_GIT_SHA: "azure-sha",
      GITHUB_SHA: "github-sha",
      VERCEL_GIT_COMMIT_SHA: "vercel-sha",
    } as NodeJS.ProcessEnv)).toBe("azure-sha");
  });

  it("falls back to GitHub SHA when Azure runtime SHA is unavailable", () => {
    expect(resolveProductionDeploymentCommit({
      GITHUB_SHA: "github-sha",
      VERCEL_GIT_COMMIT_SHA: "vercel-sha",
    } as NodeJS.ProcessEnv)).toBe("github-sha");
  });

  it("keeps Vercel SHA only as a compatibility fallback", () => {
    expect(resolveProductionDeploymentCommit({
      VERCEL_GIT_COMMIT_SHA: "vercel-sha",
    } as NodeJS.ProcessEnv)).toBe("vercel-sha");
  });

  it("returns null when no runtime SHA is available", () => {
    expect(resolveProductionDeploymentCommit({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
