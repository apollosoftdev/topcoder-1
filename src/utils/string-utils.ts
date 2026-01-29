// [NOTE]: String utility functions for safe text matching

/**
 * Check if a character is alphanumeric (a-z, A-Z, 0-9)
 * Uses character codes instead of regex to avoid ReDoS concerns
 */
function isAlphanumeric(char: string): boolean {
  if (char.length !== 1) return false;
  const code = char.charCodeAt(0);
  // 0-9: 48-57, A-Z: 65-90, a-z: 97-122
  return (code >= 48 && code <= 57) ||
         (code >= 65 && code <= 90) ||
         (code >= 97 && code <= 122);
}

/**
 * Check if a character is a word boundary (not alphanumeric)
 */
function isWordBoundary(char: string): boolean {
  return !isAlphanumeric(char);
}

/**
 * Safe word boundary check without regex or bracket notation
 * Checks if a word appears as a complete word in the text (not as part of another word)
 * @param text - The text to search in (should be lowercase for case-insensitive matching)
 * @param word - The word to find (should be lowercase for case-insensitive matching)
 * @returns true if the word appears as a whole word in the text
 */
export function isWholeWordMatch(text: string, word: string): boolean {
  let index = 0;

  while ((index = text.indexOf(word, index)) !== -1) {
    // Use charAt() instead of bracket notation to avoid object injection warnings
    const charBefore = index > 0 ? text.charAt(index - 1) : ' ';
    const charAfter = index + word.length < text.length ? text.charAt(index + word.length) : ' ';

    // Use character code checking instead of regex to avoid ReDoS warnings
    const boundaryBefore = isWordBoundary(charBefore);
    const boundaryAfter = isWordBoundary(charAfter);

    if (boundaryBefore && boundaryAfter) {
      return true;
    }
    index++;
  }

  return false;
}
