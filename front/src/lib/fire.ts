/**
 * Adapts an async handler to a DOM event attribute: the promise is started and
 * deliberately not awaited (the handler reports its own outcome).
 */
export function fire<A extends unknown[]>(
  handler: (...args: A) => Promise<unknown>,
): (...args: A) => void {
  return (...args: A) => {
    void handler(...args);
  };
}
