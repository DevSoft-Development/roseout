import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("website production verification release checklist", () => {
  it("documents all seven release gates without adding a scheduler", () => {
    const checklist = read("docs/website-production-verification-checklist.md");
    for (const heading of [
      "## 1. Published website",
      "## 2. Hosting redundancy",
      "## 3. Website address paths",
      "## 4. Migration providers",
      "## 5. Migration review",
      "## 6. Premium design QA",
      "## 7. Operations",
    ]) expect(checklist).toContain(heading);
    expect(checklist).toContain("Do not add a new scheduler");
  });
});
