/**
 * File name conventions for license files. Mirrors the patterns GitHub's licensee uses to
 * detect license files, so anything GitHub shows as a repository's license is found here too.
 */

interface Kind {
  /** Lower ranks are written first. */
  rank: number;
  word: string;
  /** Allows "<word>-<anything>" and "<anything>-<word>" forms (LICENSE-MIT, MIT-LICENSE). */
  decorated: boolean;
}

const KINDS: readonly Kind[] = [
  { rank: 0, word: "(?:un)?licen[sc]e", decorated: true },
  { rank: 1, word: "copying", decorated: true },
  { rank: 2, word: "ofl", decorated: false },
  { rank: 3, word: "copyright", decorated: true },
  { rank: 4, word: "patents", decorated: false },
];

const EXTENSION = "(?:\\.[^./]+)*";

const PATTERNS = KINDS.map(({ rank, word, decorated }) => ({
  rank,
  pattern: new RegExp(
    decorated ? `^(?:[^.]*[-_])?(?:${word})(?:[-_][^.]*)?${EXTENSION}$` : `^(?:${word})${EXTENSION}$`,
    "i",
  ),
}));

/** Extensions that are code, data or binary rather than license text. */
const EXCLUDED_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".json",
  ".map",
  ".node",
  ".css",
  ".xml",
  ".sh",
  ".go",
  ".gemspec",
  ".spdx",
  ".header",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".pdf",
]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function isReadableText(name: string): boolean {
  return !EXCLUDED_EXTENSIONS.has(extensionOf(name));
}

/** Rank of a license file name (0 is LICENSE-like), or undefined when it isn't one. */
export function licenseRank(name: string): number | undefined {
  if (!isReadableText(name)) {
    return undefined;
  }
  return PATTERNS.find(({ pattern }) => pattern.test(name))?.rank;
}

export function isLicenseFileName(name: string): boolean {
  return licenseRank(name) !== undefined;
}

const NOTICE_NAME = /^notice(?<rest>[-_. ].*)?$/i;

export function isNoticeFileName(name: string): boolean {
  return NOTICE_NAME.test(name) && isReadableText(name);
}
