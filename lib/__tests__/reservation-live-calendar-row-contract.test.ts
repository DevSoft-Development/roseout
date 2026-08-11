import fs from "node:fs";
import path from "node:path";

describe("reservation live calendar layout contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/reserve/location/[locationId]/page.tsx"),
    "utf8",
  );

  it("keeps date and preferred time in one two-column row", () => {
    expect(source).toContain('className="grid grid-cols-2 gap-3"');
    expect(source).toContain('label="Date"');
    expect(source).toContain('label="Preferred time"');
  });

  it("uses an interactive calendar instead of a native date input", () => {
    expect(source).toContain('aria-label="Choose reservation date"');
    expect(source).toContain('aria-label="Previous month"');
    expect(source).toContain('aria-label="Next month"');
    expect(source).toContain("chooseDate(dayValue)");
    expect(source).not.toContain('type="date"');
  });

  it("prevents past dates and refreshes availability from selected date", () => {
    expect(source).toContain("const disabled = iso < today");
    expect(source).toContain("setDate(next)");
    expect(source).toContain("}, [date, partySize]);");
  });

  it("keeps the venue tab strip content width", () => {
    expect(source).toContain('className="inline-flex min-w-max gap-1"');
  });
});
