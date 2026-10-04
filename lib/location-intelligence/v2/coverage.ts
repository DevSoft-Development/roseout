import "server-only";

export type CoverageInventory = {
  area: string;
  category: string;
  current: number;
  target: number;
  searchDemand?: number;
  resultGapRate?: number;
};

export function coveragePriority(input: CoverageInventory) {
  const target = Math.max(1, input.target);
  const deficit = Math.max(0, target - input.current) / target;
  const saturation = Math.max(0, input.current - target) / target;
  const demand = Math.max(0, Number(input.searchDemand || 0));
  const gap = Math.max(0, Number(input.resultGapRate || 0));

  return Math.max(0, deficit * 70 + Math.min(20, demand * 20) + Math.min(20, gap * 20) - saturation * 40);
}

export function sortCoverageGaps(rows: CoverageInventory[]) {
  return [...rows].sort((a, b) => coveragePriority(b) - coveragePriority(a));
}
