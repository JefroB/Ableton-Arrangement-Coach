/**
 * Project Key Derivation — converts an Ableton Set file path into a
 * filesystem-safe string suitable for use as a persistence filename.
 *
 * The derived key:
 * - Contains only alphanumeric characters, hyphens, and underscores
 * - Is at most 128 characters long
 * - Is deterministic (same path always produces the same key)
 * - Is unique (different paths produce different keys)
 *
 * When the sanitized path exceeds 128 characters, the key is truncated
 * and a hash suffix is appended to preserve uniqueness.
 */

// ─── Constants ─────────────────────────────────────────────────────────

const MAX_KEY_LENGTH = 128;

/**
 * Length reserved for the hash suffix when truncation is needed.
 * Format: `_` + 16 hex chars = 17 characters.
 */
const HASH_SUFFIX_LENGTH = 17;

// ─── Hash Function ─────────────────────────────────────────────────────

/**
 * Simple deterministic string hash producing a 16-character hex string.
 * Uses FNV-1a (64-bit, approximated via two 32-bit halves) for good
 * distribution and collision resistance.
 */
function hashString(input: string): string {
  // FNV-1a 32-bit for first half
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }

  // FNV-1a 32-bit for second half (seeded differently)
  let h2 = 0x6c62272e;
  for (let i = 0; i < input.length; i++) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }

  return (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0");
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Derive a filesystem-safe project key from a Set file path.
 *
 * @param setFilePath - The full path to the Ableton Set file.
 * @returns A string of at most 128 characters containing only [a-zA-Z0-9_-].
 * @throws {Error} If setFilePath is empty.
 */
export function deriveProjectKey(setFilePath: string): string {
  if (setFilePath.length === 0) {
    throw new Error("setFilePath must not be empty");
  }

  // Replace any character that is not alphanumeric, hyphen, or underscore
  const sanitized = setFilePath.replace(/[^a-zA-Z0-9\-_]/g, "_");

  // Always append a hash of the original path to guarantee uniqueness
  // (sanitization is lossy — multiple inputs can produce the same sanitized form)
  const hash = hashString(setFilePath);
  const withHash = `${sanitized}_${hash}`;

  if (withHash.length <= MAX_KEY_LENGTH) {
    return withHash;
  }

  // Truncate the sanitized prefix and keep the hash suffix for uniqueness
  const truncated = sanitized.slice(0, MAX_KEY_LENGTH - HASH_SUFFIX_LENGTH);
  return `${truncated}_${hash}`;
}
