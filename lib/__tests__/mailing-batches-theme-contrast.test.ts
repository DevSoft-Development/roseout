import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appearance = readFileSync("app/admin/admin-appearance.css", "utf8");
const page = readFileSync("app/admin/dashboard/operations/mailing-batches/page.tsx", "utf8");
const form = readFileSync("app/admin/dashboard/operations/mailing-batches/MailingBatchCreateForm.tsx", "utf8");

describe("mailing batches appearance", () => {
  it("defines canonical admin tokens for both dark and light mode", () => {
    expect(appearance).toContain('.admin-theme[data-admin-theme="dark"]');
    expect(appearance).toContain("--admin-bg: #050505");
    expect(appearance).toContain("--admin-text: #ffffff");
    expect(appearance).toContain('.admin-theme[data-admin-theme="light"]');
    expect(appearance).toContain("--admin-bg: #f6f2ef");
    expect(appearance).toContain("--admin-text: #211512");
  });

  it("uses theme tokens for the mailing batch page instead of dark-only text opacity", () => {
    expect(page).toContain("bg-[var(--admin-bg)]");
    expect(page).toContain("text-[var(--admin-text)]");
    expect(page).toContain("text-[var(--admin-muted)]");
    expect(page).not.toContain("text-white/35");
    expect(page).not.toContain("text-white/40");
    expect(page).not.toContain("text-white/45");
    expect(page).not.toContain("text-white/55");
  });

  it("uses readable theme-aware form fields and helper copy", () => {
    expect(form).toContain("bg-[var(--admin-panel)]");
    expect(form).toContain("text-[var(--admin-text)]");
    expect(form).toContain("text-[var(--admin-muted)]");
    expect(form).toContain("border-[var(--admin-border-strong)]");
    expect(form).not.toContain("text-white/30");
    expect(form).not.toContain("text-white/35");
    expect(form).not.toContain("text-white/40");
    expect(form).not.toContain("text-white/45");
    expect(form).not.toContain("text-white/50");
    expect(form).not.toContain("text-white/55");
  });
});
