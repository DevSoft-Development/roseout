import fs from "node:fs";
import path from "node:path";

describe("Reserve Floor Snapshot operational status colors", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "components/reserve/ReserveFloorSnapshot.tsx"),
    "utf8",
  );

  test("uses colors for operational meaning instead of reservation confirmation state", () => {
    expect(source).toContain('Open: "border-emerald-400/45 bg-emerald-500/10 text-emerald-300"');
    expect(source).toContain('Confirmed: "border-blue-400/45 bg-blue-500/10 text-blue-300"');
    expect(source).toContain('Seated: "border-purple-400/50 bg-purple-500/10 text-purple-300"');
    expect(source).toContain('Blocked: "border-red-400/50 bg-red-500/10 text-red-300"');
  });

  test("labels confirmed future inventory as reserved and shows the reservation time", () => {
    expect(source).toContain('if (status === "Confirmed" || status === "Reserved") return "Reserved"');
    expect(source).toContain('Reserved · {formatReservationTime(state.reservation.reservation_time)}');
  });

  test("shows a visible floor color legend", () => {
    expect(source).toContain("Floor status color legend");
    expect(source).toContain('{ label: "Available", className: statusStyles.Open }');
    expect(source).toContain('{ label: "Reserved", className: statusStyles.Confirmed }');
    expect(source).toContain('{ label: "Waiting / ready", className: statusStyles.Waiting }');
    expect(source).toContain('{ label: "Seated", className: statusStyles.Seated }');
    expect(source).toContain('{ label: "Blocked", className: statusStyles.Blocked }');
  });
});
