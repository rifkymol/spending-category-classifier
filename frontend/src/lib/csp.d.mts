// Types for csp.mjs (plain JavaScript so scripts/check-csp.mjs can import it with plain node).

export const DEFAULT_API_URL: string;
export function apiOrigin(apiUrl: string | undefined): string;
export function buildCsp(options: { nonce: string; apiUrl: string | undefined; dev?: boolean }): string;
export function makeNonce(): string;
export const SECURITY_HEADERS: { key: string; value: string }[];
