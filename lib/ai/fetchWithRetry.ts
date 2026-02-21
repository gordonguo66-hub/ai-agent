const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 529]);
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1500;

/**
 * Fetch wrapper with exponential backoff for transient API errors.
 * Drop-in replacement for fetch() — same signature, same return type.
 *
 * Retries on: 429 (rate limit), 502 (bad gateway), 503 (unavailable), 529 (overloaded)
 * Backoff: 1s, 2s, 4s (with jitter). Respects Retry-After header.
 */
export async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(input, init);

    if (res.ok || !RETRYABLE_STATUS_CODES.has(res.status)) {
      return res;
    }

    lastResponse = res;

    if (attempt === MAX_RETRIES) {
      break;
    }

    // Calculate delay: exponential backoff with jitter
    let delayMs = BASE_DELAY_MS * Math.pow(2, attempt);

    // Respect Retry-After header if present
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const retryAfterMs = Number(retryAfter) * 1000;
      if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        delayMs = Math.max(delayMs, retryAfterMs);
      }
    }

    // Add jitter (0-25% of delay)
    delayMs += Math.random() * delayMs * 0.25;

    console.log(
      `[AI Retry] Got ${res.status}, retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})`
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return lastResponse!;
}
