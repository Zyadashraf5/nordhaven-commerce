/** Types for the F06 seed scripts' shared admin client (admin-client.mjs). */
export function requireConfirm(args: string[], what: string): void;
export function loadEnvFile(args: string[]): void;
export function API(): string;
export function call(
  method: string,
  path: string,
  options?: { body?: unknown; token?: string },
): Promise<{ status: number; json: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
export function signInAdmin(): Promise<string>;
export function must<T = unknown>(result: { status: number; json: T }, what: string): T;
