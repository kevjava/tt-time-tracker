/**
 * Utilities for converting between numeric database IDs and letter-based display IDs
 * for scheduled tasks. Uses Excel column style: a-z, aa-az, ba-bz, etc.
 *
 * This prevents confusion between session IDs (numeric) and schedule IDs (letters).
 */

/**
 * Convert a numeric database ID to a letter-based display ID.
 * 1→a, 26→z, 27→aa, 52→az, 53→ba, 702→zz, 703→aaa
 */
export function numToLetter(n: number): string {
  if (n <= 0) {
    throw new Error('ID must be a positive integer');
  }

  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/**
 * Convert a letter-based display ID to a numeric database ID.
 * a→1, z→26, aa→27, az→52, ba→53, zz→702, aaa→703
 */
export function letterToNum(s: string): number {
  const lower = s.toLowerCase();

  if (!/^[a-z]+$/.test(lower)) {
    throw new Error(
      `Invalid schedule ID "${s}". Schedule IDs use letters (e.g., 'a', 'af'), not numbers. Did you mean \`tt edit ${s}\` for a session?`
    );
  }

  let result = 0;
  for (const char of lower) {
    result = result * 26 + (char.charCodeAt(0) - 96);
  }
  return result;
}
