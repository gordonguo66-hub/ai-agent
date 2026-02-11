/**
 * URL Validation Utility
 *
 * Prevents open redirect vulnerabilities by validating return URLs
 * against an allowlist of safe paths.
 */

/**
 * Allowed path prefixes for return URLs
 * Only these paths (and their sub-paths) are considered safe for redirection
 */
const ALLOWED_PATH_PREFIXES = [
  '/dashboard',
  '/settings',
  '/arena',
  '/community',
  '/strategy',
  '/pricing',
  '/u/', // User profiles
  '/messages',
];

/**
 * Default return URL when validation fails
 */
const DEFAULT_RETURN_URL = '/dashboard';

/**
 * Check if a URL is a valid return URL
 *
 * A valid return URL must:
 * 1. Start with a single forward slash (not //)
 * 2. Not contain a host or protocol
 * 3. Start with one of the allowed path prefixes
 *
 * @param url - The URL to validate
 * @returns true if the URL is safe for redirection
 */
export function isValidReturnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Must start with single forward slash, not //
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false;
  }

  // Check for URL-encoded protocol-relative URLs
  if (url.startsWith('/%2f') || url.startsWith('/%2F')) {
    return false;
  }

  // Parse and verify no host is specified
  try {
    const parsed = new URL(url, 'http://dummy.com');
    // If host changed from dummy.com, URL contained a host
    if (parsed.host !== 'dummy.com') {
      return false;
    }
    // Check for javascript: or data: protocols
    if (parsed.protocol !== 'http:') {
      return false;
    }
  } catch {
    return false;
  }

  // Get the path without query string
  const pathOnly = url.split('?')[0].split('#')[0];

  // Check against allowlist
  return ALLOWED_PATH_PREFIXES.some(prefix =>
    pathOnly === prefix || pathOnly.startsWith(prefix)
  );
}

/**
 * Sanitize a return URL, falling back to default if invalid
 *
 * @param url - The URL to sanitize
 * @param defaultUrl - The fallback URL (defaults to /dashboard)
 * @returns A safe URL for redirection
 */
export function sanitizeReturnUrl(
  url: string | null | undefined,
  defaultUrl: string = DEFAULT_RETURN_URL
): string {
  if (isValidReturnUrl(url)) {
    return url!;
  }
  return defaultUrl;
}

/**
 * Extract and validate the 'next' parameter from URL search params
 *
 * @param searchParams - URLSearchParams object
 * @param defaultUrl - The fallback URL
 * @returns A safe URL for redirection
 */
export function getValidNextUrl(
  searchParams: URLSearchParams | null | undefined,
  defaultUrl: string = DEFAULT_RETURN_URL
): string {
  const nextParam = searchParams?.get('next');
  return sanitizeReturnUrl(nextParam, defaultUrl);
}
