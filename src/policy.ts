/**
 * License review: flags declared licenses whose terms go beyond attribution.
 * This is a signal for a human to review, not legal advice.
 */

export type Category = "weak-copyleft" | "strong-copyleft" | "network-copyleft" | "restricted" | "unclear";

/** Ordered from mildest to most severe. */
export const CATEGORIES: readonly Category[] = [
  "weak-copyleft",
  "strong-copyleft",
  "network-copyleft",
  "restricted",
  "unclear",
];

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  "weak-copyleft": "Weak copyleft",
  "strong-copyleft": "Strong copyleft",
  "network-copyleft": "Network copyleft",
  restricted: "Restricted use",
  unclear: "Unclear terms",
};

const GROUPS: Readonly<Record<string, readonly Category[]>> = {
  copyleft: ["weak-copyleft", "strong-copyleft", "network-copyleft"],
  any: CATEGORIES,
};

export const CATEGORY_CHOICES: readonly string[] = [...CATEGORIES, ...Object.keys(GROUPS)];

export interface Finding {
  name: string;
  version: string;
  /** The declared license expression, or undefined when the package declares none. */
  license: string | undefined;
  category: Category;
  /** The license id that triggered the category (the whole expression when it can't be parsed). */
  id: string;
}

/** Expands category names and the "copyleft" and "any" groups. Returns undefined for an unknown name. */
export function expandCategories(values: readonly string[]): Category[] | undefined {
  const result = new Set<Category>();
  for (const raw of values) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const group = GROUPS[value];
    if (group) {
      for (const category of group) result.add(category);
    } else if ((CATEGORIES as readonly string[]).includes(value)) {
      result.add(value as Category);
    } else {
      return undefined;
    }
  }
  return [...result];
}

const RESTRICTED = [/^busl-/, /^elastic-/, /^polyform-/, /^cc-by-nc/, /^cc-by-nd/, /^commons-clause/, /^json$/];
const NETWORK = [/^agpl-/, /^sspl-/];
const STRONG = [/^gpl-/, /^cc-by-sa-/];
const WEAK = [/^lgpl-/, /^mpl-/, /^epl-/, /^cddl-/, /^eupl-/, /^cpl-/, /^ms-rl$/, /^cecill-/];
const UNCLEAR = [/^unlicensed$/, /^none$/, /^unknown$/, /^licenseref-/, /^documentref-/];

interface Outcome {
  /** 0 means nothing to flag. */
  severity: number;
  category: Category | undefined;
  id: string;
}

const FINE: Outcome = { severity: 0, category: undefined, id: "" };

function classifyId(rawId: string, hasException: boolean): Outcome {
  const id = rawId.toLowerCase().replace(/\+$/, "");
  const make = (category: Category): Outcome => ({ category, severity: CATEGORIES.indexOf(category) + 1, id: rawId });
  if (UNCLEAR.some((p) => p.test(id))) return make("unclear");
  if (RESTRICTED.some((p) => p.test(id))) return make("restricted");
  if (NETWORK.some((p) => p.test(id))) return make("network-copyleft");
  if (STRONG.some((p) => p.test(id))) {
    return make(hasException || id.includes("-with-") ? "weak-copyleft" : "strong-copyleft");
  }
  if (WEAK.some((p) => p.test(id))) return make("weak-copyleft");
  return { ...FINE, id: rawId };
}

class ParseError extends Error {}

/** Evaluates an SPDX expression: OR picks the mildest alternative, AND takes the most severe. */
function evaluateExpression(expression: string): Outcome {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;

  const peek = (): string | undefined => tokens[position];
  const isKeyword = (token: string | undefined, word: string): boolean => token?.toUpperCase() === word;

  const parseOr = (): Outcome => {
    let best = parseAnd();
    while (isKeyword(peek(), "OR")) {
      position++;
      const next = parseAnd();
      if (next.severity < best.severity) best = next;
    }
    return best;
  };

  const parseAnd = (): Outcome => {
    let worst = parseTerm();
    while (isKeyword(peek(), "AND")) {
      position++;
      const next = parseTerm();
      if (next.severity > worst.severity) worst = next;
    }
    return worst;
  };

  const parseTerm = (): Outcome => {
    const token = tokens[position++];
    if (
      token === undefined ||
      token === ")" ||
      isKeyword(token, "AND") ||
      isKeyword(token, "OR") ||
      isKeyword(token, "WITH")
    ) {
      throw new ParseError();
    }
    if (token === "(") {
      const inner = parseOr();
      if (tokens[position++] !== ")") throw new ParseError();
      return inner;
    }
    let hasException = false;
    if (isKeyword(peek(), "WITH")) {
      position++;
      if (tokens[position++] === undefined) throw new ParseError();
      hasException = true;
    }
    return classifyId(token, hasException);
  };

  const outcome = parseOr();
  if (position !== tokens.length) throw new ParseError();
  return outcome;
}

/** Returns the category a declared license falls into, or undefined when there is nothing to flag. */
export function reviewLicense(license: string | undefined): { category: Category; id: string } | undefined {
  const text = license?.trim();
  if (!text) {
    return { category: "unclear", id: "(none)" };
  }
  if (/^see license in\b/i.test(text)) {
    return { category: "unclear", id: text };
  }
  try {
    const outcome = evaluateExpression(text);
    return outcome.category ? { category: outcome.category, id: outcome.id } : undefined;
  } catch (error) {
    if (error instanceof ParseError) {
      return { category: "unclear", id: text };
    }
    throw error;
  }
}
