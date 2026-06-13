/**
 * Debounce utility — delays execution of a function until a specified
 * quiet period has elapsed since the last invocation.
 *
 * The returned function exposes a `cancel()` method to clear any
 * pending invocation (useful for teardown/cleanup).
 *
 * Uses the standard setTimeout/clearTimeout pattern.
 */

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Returns a debounced version of `fn` that delays execution until
 * `delayMs` milliseconds have elapsed since the last invocation.
 *
 * @param fn - The function to debounce.
 * @param delayMs - The debounce delay in milliseconds.
 * @returns A debounced function with a `cancel()` method.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): T & { cancel(): void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: unknown, ...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn.apply(this, args);
    }, delayMs);
  } as T & { cancel(): void };

  debounced.cancel = function (): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
