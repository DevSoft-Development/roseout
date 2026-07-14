export function markDuration(start: number) {
  return Math.max(0, Math.round(performance.now() - start));
}
