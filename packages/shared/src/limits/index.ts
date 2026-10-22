export const MAX_SELECTION_CHARS = 10_000;
export const MAX_SENTENCES = 150;
export const MAX_REFS_PER_POINT = 6;

export function isWithinSelectionLimits(chars: number, sentences: number): boolean {
  return chars <= MAX_SELECTION_CHARS && sentences <= MAX_SENTENCES;
}
