import fs from "node:fs";
import path from "node:path";

describe("Reserve Floor Snapshot operational status colors", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "components/reserve/ReserveFloorSnapshot.tsx"),
    "utf8",
  );

  test("uses color for current usability instead of every future reservation", () => {
    expect(source).toContain('Open: "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"');
    expect(source).toContain('"Reserved soon": "border-amber-400/50 bg-amber-500/10 text-amber-300"');
    expect(source).not.toContain('Confirmed: "border-blue-400/45');
    expect(source).toContain('Seated: "border-purple-400/50 bg-purple-500/10 text-purple-300"');
    expect(source).toContain('Blocked: "border-red-400/50 bg-red-500/10 text-red-300"');
  });

  test("keeps distant future reservations available until the configured turn-time conflict window", () => {
    expect(source).toContain("function resourceTurnMinutes");
    expect(source).toContain("minutesUntil > turnMinutes");
    expect(source).toContain('displayStatus: "Available now"');
    expect(source).toContain('return `Next reservation · ${formatted}`');
    expect(source).toContain('displayStatus: "Reserved soon"');
    expect(source).toContain('return `Reserved soon · ${formatted}`');
  });

  test("uses configured duration fields before the safe 90 minute fallback", () => {
    expect(source).toContain("resource?.slot_duration_minutes");
    expect(source).toContain("resource?.duration_minutes");
    expect(source).toContain("resource?.default_duration_minutes");
    expect(source).toContain("resource?.reservation_duration_minutes");
    expect(source).toContain("resource?.turn_time_minutes");
  });

  test("shows a visible operational legend without a generic future-reserved color", () => {
    expect(source).toContain("Floor status color legend");
    expect(source).toContain('{ label: "Available now", className: statusStyles.Open }');
    expect(source).toContain('{ label: "Reserved soon", className: statusStyles["Reserved soon"] }');
    expect(source).toContain('{ label: "Waiting / ready", className: statusStyles.Waiting }');
    expect(source).toContain('{ label: "Seated", className: statusStyles.Seated }');
    expect(source).not.toContain('{ label: "Reserved",');
  });
});
