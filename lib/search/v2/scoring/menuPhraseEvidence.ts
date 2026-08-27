const normalizeMenuPhrase = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9\s]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const phraseWordCount = (value: string) => value.split(" ").filter(Boolean).length;

export const EXACT_MENU_PHRASE_BOOST = 8;

export function findExactMenuPhraseMatch(
  requestedDishTerms: readonly string[],
  signatureItems: unknown,
): string | null {
  if (!Array.isArray(signatureItems) || signatureItems.length === 0) return null;

  const menuItems = signatureItems
    .map(normalizeMenuPhrase)
    .filter(Boolean);
  if (!menuItems.length) return null;

  const requestedPhrases = [...new Set(
    requestedDishTerms
      .map(normalizeMenuPhrase)
      .filter((term) => term.length >= 5 && phraseWordCount(term) >= 2),
  )].sort((a, b) => b.length - a.length);

  for (const phrase of requestedPhrases) {
    const boundedPhrase = ` ${phrase} `;
    if (menuItems.some((item) => ` ${item} `.includes(boundedPhrase))) return phrase;
  }

  return null;
}
