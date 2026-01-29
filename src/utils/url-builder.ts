/**
 * URL building utilities for SSRF-safe API requests
 */

/**
 * Build URL with query parameters from a base URL string
 * @param baseUrl - The base URL (must be hardcoded at call site for SSRF protection)
 * @param params - Query parameters to add
 * @returns URL object with params set
 */
export function buildUrlWithParams(baseUrl: string, params: Record<string, string | number>): URL {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}
