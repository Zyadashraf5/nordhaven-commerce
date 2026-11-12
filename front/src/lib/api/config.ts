/**
 * API configuration.
 *
 * The storefront talks to the audited NestJS backend through a small, typed
 * client. Nothing in the homepage is connected yet — see `src/lib/storefront.ts`
 * — but the base URL and the paths are configured here so connecting the live
 * catalog later is a configuration change, not a rewrite.
 */

/** Public base URL of the NestJS API. Empty means "not connected". */
export const NEXT_PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ?? '';

/** Server-only override, useful when the API is reachable only from the server. */
export const API_BASE_URL =
  process.env.API_BASE_URL?.replace(/\/+$/, '') ?? NEXT_PUBLIC_API_BASE_URL;

export const API_PREFIX = '/api/v1';

export function isApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}
