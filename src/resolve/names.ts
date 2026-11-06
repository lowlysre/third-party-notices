/**
 * File name conventions for license files, ported from GitHub's Licensee
 * (lib/licensee/project_files/license_file.rb), MIT License,
 * Copyright (c) Ben Balter and Licensee contributors. See NOTICE for the full text.
 *
 * Anything GitHub detects as a repository's license file is found here too, with two
 * deliberate differences for npm packages: code, data and image extensions are never
 * license text, and a dotted version number may follow the separator (LICENSE-2.0.txt).
 */

const PREFERRED_EXT = "\\.(?:md|markdown|txt|html)";
const LICENSE_EXT = "\\.(?!spdx|header)(?:[^./]|\\.\\d)+";
const OTHER_EXT = "\\.(?!xml|sh|go|gemspec)(?:[^./]|\\.\\d)+";
const ANY_EXT = "\\.(?:[^./]|\\.\\d)+";

const LICENSE = "(?:un)?licen[sc]e";
const COPYING = "copying";
const COPYRIGHT = "copyright";
const OFL = "ofl";
const PATENTS = "patents";

/** Text between a separator and the extension: any non-dot characters, or ".<digit>" version parts. */
const TAIL = "(?:[^.]|\\.\\d)*";

/** Ordered best match first, the same order as Licensee's score table. */
const RULES = [
  `${LICENSE}`, // LICENSE
  `${LICENSE}${PREFERRED_EXT}`, // LICENSE.md
  `${COPYING}`, // COPYING
  `${COPYING}${PREFERRED_EXT}`, // COPYING.md
  `${LICENSE}${LICENSE_EXT}`, // LICENSE.textile
  `${COPYING}${ANY_EXT}`, // COPYING.textile
  `${LICENSE}[-_]${TAIL}(?:${OTHER_EXT})?`, // LICENSE-MIT
  `${COPYING}[-_]${TAIL}(?:${OTHER_EXT})?`, // COPYING-MIT
  `\\w+[-_]${LICENSE}${TAIL}(?:${OTHER_EXT})?`, // MIT-LICENSE
  `\\w+[-_]${COPYING}${TAIL}(?:${OTHER_EXT})?`, // MIT-COPYING
  `${OFL}${PREFERRED_EXT}`, // OFL.md
  `${OFL}${OTHER_EXT}`, // OFL.textile
  `${OFL}`, // OFL
  `${COPYRIGHT}`, // COPYRIGHT
  `${COPYRIGHT}${PREFERRED_EXT}`, // COPYRIGHT.txt
  `${COPYRIGHT}${OTHER_EXT}`, // COPYRIGHT.textile
  `${COPYRIGHT}[-_]${TAIL}(?:${OTHER_EXT})?`, // COPYRIGHT-MIT
  `${PATENTS}`, // PATENTS
  `${PATENTS}${OTHER_EXT}`, // PATENTS.txt
].map((rule) => new RegExp(`^${rule}$`, "i"));

/** Files inside a LICENSES directory (REUSE): an SPDX id or LicenseRef-* plus a text extension. */
const REUSE_NAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.(?:md|markdown|txt|html)$/i;

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

/** Rank of a license file name (0 is the best match), or undefined when it isn't one. */
export function licenseRank(name: string): number | undefined {
  if (!isReadableText(name)) {
    return undefined;
  }
  const index = RULES.findIndex((rule) => rule.test(name));
  return index === -1 ? undefined : index;
}

export function isLicenseFileName(name: string): boolean {
  return licenseRank(name) !== undefined;
}

/** True for a file inside a LICENSES (or licenses) directory that holds license text. */
export function isLicensesDirFile(name: string): boolean {
  return isReadableText(name) && (REUSE_NAME.test(name) || licenseRank(name) !== undefined);
}

const NOTICE_NAME = /^notice(?<rest>[-_. ].*)?$/i;

export function isNoticeFileName(name: string): boolean {
  return NOTICE_NAME.test(name) && isReadableText(name);
}
