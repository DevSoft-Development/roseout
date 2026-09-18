/** Normalizes PostgREST to-one embeds across object and one-element array shapes. */
export function normalizeSingleRelation<T>(
  relation: T | readonly T[] | null | undefined,
): T | null {
  if (relation == null) return null;
  return Array.isArray(relation) ? relation[0] ?? null : (relation as T);
}

/** Normalizes PostgREST to-many embeds without mutating the returned relation. */
export function normalizeManyRelation<T>(
  relation: T | readonly T[] | null | undefined,
): T[] {
  if (relation == null) return [];
  return Array.isArray(relation) ? [...relation] : [relation as T];
}
