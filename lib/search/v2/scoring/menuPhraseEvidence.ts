const normalizeMenuPhrase = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9\s]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const phraseWordCount = (value: string) => value.split(" ").filter(Boolean).length;
const hasWholeTerm = (item: string, term: string) => ` ${item} `.includes(` ${term} `);

export const EXACT_MENU_PHRASE_BOOST = 16;

export function findExactMenuPhraseMatch(
  requestedDishTerms: readonly string[],
  signatureItems: unknown,
): string | null {
  if (!Array.isArray(signatureItems) || signatureItems.length === 0) return null;

  const menuItems = signatureItems
    .map(normalizeMenuPhrase)
    .filter(Boolean);
  if (!menuItems.length) return null;

  const normalizedRequested = [...new Set(
    requestedDishTerms.map(normalizeMenuPhrase).filter(Boolean),
  )];

  const requestedPhrases = normalizedRequested
    .filter((term) => term.length >= 5 && phraseWordCount(term) >= 2)
    .sort((a, b) => b.length - a.length);

  for (const phrase of requestedPhrases) {
    if (menuItems.some((item) => hasWholeTerm(item, phrase))) return phrase;
  }

  // Queries such as "steak and lobster" are often expanded into both the phrase
  // and its atomic dish terms. Treat verified coverage of every atomic dish across
  // signature menu items as strong structured evidence even when no single menu
  // item contains the exact phrase.
  const atomicDishTerms = normalizedRequested
    .filter((term) => phraseWordCount(term) === 1 && term.length >= 3);

  if (atomicDishTerms.length >= 2) {
    const covered = atomicDishTerms.every((term) => menuItems.some((item) => hasWholeTerm(item, term)));
    if (covered) return atomicDishTerms.join(" + ");
  }

  return null;
}
