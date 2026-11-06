/**
 * License review: flags declared licenses whose terms go beyond attribution.
 * A signal for a human, not legal advice.
 */
import { matchesAny } from "./patterns.js";
import type { ResolvedPackage } from "./types.js";

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
  category: Category;
  /** The license id that triggered the category, or the whole expression when it can't be parsed. */
  id: string;
}

/** Expands category names plus the `copyleft` and `any` groups. Undefined when a name is unknown. */
export function expandCategories(values: readonly string[]): Category[] | undefined {
  const result = new Set<Category>();
  for (const value of values.map((raw) => raw.trim().toLowerCase()).filter(Boolean)) {
    const expanded =
      GROUPS[value] ?? ((CATEGORIES as readonly string[]).includes(value) ? [value as Category] : undefined);
    if (!expanded) return undefined;
    for (const category of expanded) result.add(category);
  }
  return [...result];
}

const RESTRICTED = [/^busl-/, /^elastic-/, /^polyform-/, /^cc-by-nc/, /^cc-by-nd/, /^commons-clause/, /^json$/];
const NETWORK = [/^agpl-/, /^sspl-/];
const STRONG = [/^gpl-/, /^cc-by-sa-/];
const WEAK = [/^lgpl-/, /^mpl-/, /^epl-/, /^cddl-/, /^eupl-/, /^cpl-/, /^ms-rl$/, /^cecill-/];
const UNCLEAR = [/^unlicensed$/, /^none$/, /^unknown$/, /^licenseref-/, /^documentref-/];

/** Severity 0 means nothing to flag. */
interface Outcome {
  severity: number;
  category: Category | undefined;
  id: string;
}

const matches = (patterns: RegExp[], id: string): boolean => patterns.some((pattern) => pattern.test(id));

function classifyId(rawId: string, hasException: boolean): Outcome {
  const id = rawId.toLowerCase().replace(/\+$/, "");
  const flag = (category: Category): Outcome => ({ category, severity: CATEGORIES.indexOf(category) + 1, id: rawId });
  if (matches(UNCLEAR, id)) return flag("unclear");
  if (matches(RESTRICTED, id)) return flag("restricted");
  if (matches(NETWORK, id)) return flag("network-copyleft");
  if (matches(STRONG, id)) return flag(hasException || id.includes("-with-") ? "weak-copyleft" : "strong-copyleft");
  if (matches(WEAK, id)) return flag("weak-copyleft");
  return { severity: 0, category: undefined, id: rawId };
}

class ParseError extends Error {}

/** Evaluates an SPDX expression: `OR` takes the mildest alternative, `AND` the most severe. */
function evaluate(expression: string): Outcome {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;
  const peek = () => tokens[position]?.toUpperCase();

  const parseOr = (): Outcome => {
    let best = parseAnd();
    while (peek() === "OR") {
      position++;
      const next = parseAnd();
      if (next.severity < best.severity) best = next;
    }
    return best;
  };

  const parseAnd = (): Outcome => {
    let worst = parseTerm();
    while (peek() === "AND") {
      position++;
      const next = parseTerm();
      if (next.severity > worst.severity) worst = next;
    }
    return worst;
  };

  const parseTerm = (): Outcome => {
    const token = tokens[position++];
    if (token === undefined || [")", "AND", "OR", "WITH"].includes(token.toUpperCase())) throw new ParseError();
    if (token === "(") {
      const inner = parseOr();
      if (tokens[position++] !== ")") throw new ParseError();
      return inner;
    }
    let hasException = false;
    if (peek() === "WITH") {
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

/** The category a declared license falls into, or undefined when there is nothing to flag. */
export function reviewLicense(license: string | undefined): { category: Category; id: string } | undefined {
  const text = license?.trim();
  if (!text) return { category: "unclear", id: "(none)" };
  if (/^see license in\b/i.test(text)) return { category: "unclear", id: text };
  try {
    const { category, id } = evaluate(text);
    return category && { category, id };
  } catch (error) {
    if (error instanceof ParseError) return { category: "unclear", id: text };
    throw error;
  }
}

/** Findings for the packages that need review, most severe first. `allow` patterns exempt a package. */
export function reviewPackages(packages: readonly ResolvedPackage[], allow: readonly string[]): Finding[] {
  const findings = packages
    .filter((pkg) => !matchesAny(allow, pkg.name, pkg.version))
    .flatMap((pkg) => {
      const review = reviewLicense(pkg.license);
      return review ? [{ name: pkg.name, version: pkg.version, ...review }] : [];
    });
  const severity = (finding: Finding) => CATEGORIES.indexOf(finding.category);
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return findings.sort((a, b) => severity(b) - severity(a) || order(a.id, b.id) || order(a.name, b.name));
}
