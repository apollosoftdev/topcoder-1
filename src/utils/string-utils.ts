// [NOTE]: String utility functions for safe text matching

/**
 * Safe word boundary check without dynamic RegExp (ReDoS-safe)
 * Checks if a word appears as a complete word in the text (not as part of another word)
 * @param text - The text to search in (should be lowercase for case-insensitive matching)
 * @param word - The word to find (should be lowercase for case-insensitive matching)
 * @returns true if the word appears as a whole word in the text
 */
export function isWholeWordMatch(text: string, word: string): boolean {
  const wordBoundaryChars = /[^a-z0-9]/i;
  let index = 0;

  while ((index = text.indexOf(word, index)) !== -1) {
    const charBefore = index > 0 ? text[index - 1] : ' ';
    const charAfter = index + word.length < text.length ? text[index + word.length] : ' ';

    const boundaryBefore = wordBoundaryChars.test(charBefore);
    const boundaryAfter = wordBoundaryChars.test(charAfter);

    if (boundaryBefore && boundaryAfter) {
      return true;
    }
    index++;
  }

  return false;
}
