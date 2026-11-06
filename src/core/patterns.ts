const REGEX_PATTERN = /^\/(.+)\/([a-z]*)$/;

const toRegex = (pattern: string): RegExp | undefined => {
  const match = REGEX_PATTERN.exec(pattern);
  if (!match) return undefined;
  try {
    return new RegExp(match[1] ?? "", match[2]);
  } catch {
    return undefined;
  }
};

/**
 * Package patterns are `name`, `name@version`, or `/regex/flags` matched against the name.
 * Only a malformed regular expression is invalid.
 */
export function isValidPattern(pattern: string): boolean {
  return !REGEX_PATTERN.test(pattern) || toRegex(pattern) !== undefined;
}

export function matchesPackage(pattern: string, name: string, version: string): boolean {
  if (REGEX_PATTERN.test(pattern)) {
    return toRegex(pattern)?.test(name) ?? false;
  }
  return pattern === name || pattern === `${name}@${version}`;
}

export function matchesAny(patterns: readonly string[], name: string, version: string): boolean {
  return patterns.some((pattern) => matchesPackage(pattern, name, version));
}
