export const REPLAY_HISTORY_RUN_LIMIT = 20;
export const MAX_REPLAY_ITEMS_PER_RUN = 100;

export type ReplayHistoryRun = { id: string; query_count?: number | null };

export function replayItemsComplete(run: ReplayHistoryRun, items: unknown[]) {
  const expected = Number(run.query_count ?? 0);
  return expected === 0 || items.length === expected;
}

export async function loadReplayItemsPerRun<T extends ReplayHistoryRun, I>(
  runs: T[],
  load: (runId: string, limit: number) => Promise<I[]>,
) {
  const entries = await Promise.all(
    runs.map(async (run) => {
      const items = await load(String(run.id), MAX_REPLAY_ITEMS_PER_RUN);
      return [String(run.id), items] as const;
    }),
  );
  return new Map<string, I[]>(entries);
}
