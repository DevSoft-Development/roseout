import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("ML rollout persistence contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "lib/search/rankingRollout.ts"),
    "utf8",
  );

  it("does not require optional shadow and kill-switch columns in the base rollout table", () => {
    const baseSelect = source.match(/\.select\(\s*"([^"]+)"/s)?.[1] ?? "";
    expect(baseSelect).toContain("enabled");
    expect(baseSelect).toContain("rollout_percent");
    expect(baseSelect).not.toContain("shadow_enabled");
    expect(baseSelect).not.toContain("kill_switch");
  });

  it("stores safety controls in the existing app settings system", () => {
    expect(source).toContain('ML_SAFETY_CONTROLS_KEY = "search_ml_rollout_controls"');
    expect(source).toContain('.from("app_settings")');
    expect(source).toContain("shadow_enabled: next.shadow_enabled");
    expect(source).toContain("kill_switch: next.kill_switch");
  });

  it("does not make audit logging a blocker for a successful settings update", () => {
    expect(source).toContain("A logging failure must not undo");
    expect(source).toContain("audit log write failed");
  });
});
