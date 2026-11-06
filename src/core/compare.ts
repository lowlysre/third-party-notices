/** Locale-independent string order, so output is identical on every machine. */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
