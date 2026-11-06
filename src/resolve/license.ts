import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readText } from "../fs.js";
import type { ResolvedPackage } from "./tree.js";

export interface LicenseInfo {
  text: string | undefined;
  notices: string[];
}

const CODE_EXTENSIONS = new Set([
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".json",
  ".map",
  ".node",
  ".css",
  ".html",
  ".png",
  ".svg",
]);
const LICENSE_NAME = /^(?:[a-z0-9]+[-_.])?(licen[sc]e|copying|unlicen[sc]e)(?<rest>[-_. ].*)?$/i;
const NOTICE_NAME = /^notice(?<rest>[-_. ].*)?$/i;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function rank(name: string): number {
  const lower = name.toLowerCase();
  if (/licen[sc]e/.test(lower)) return 0;
  if (lower.includes("copying")) return 1;
  return 2;
}

export function isLicenseFileName(name: string): boolean {
  return LICENSE_NAME.test(name) && !CODE_EXTENSIONS.has(extensionOf(name));
}

export function isNoticeFileName(name: string): boolean {
  return NOTICE_NAME.test(name) && !CODE_EXTENSIONS.has(extensionOf(name));
}

/** Finds license text and NOTICE files in a package directory. */
export async function readLicense(pkg: Pick<ResolvedPackage, "dir">): Promise<LicenseInfo> {
  const entries = await readdir(pkg.dir, { withFileTypes: true });
  const licenseFiles: string[] = [];
  const noticeFiles: string[] = [];
  const licenseDirs: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (/^licen[sc]es$/i.test(entry.name)) licenseDirs.push(entry.name);
    } else if (isLicenseFileName(entry.name)) {
      licenseFiles.push(entry.name);
    } else if (isNoticeFileName(entry.name)) {
      noticeFiles.push(entry.name);
    }
  }

  licenseFiles.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const paths = licenseFiles.map((name) => join(pkg.dir, name));
  for (const dirName of licenseDirs.sort()) {
    const inner = await readdir(join(pkg.dir, dirName), { withFileTypes: true });
    for (const entry of inner.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isFile() && !CODE_EXTENSIONS.has(extensionOf(entry.name))) {
        paths.push(join(pkg.dir, dirName, entry.name));
      }
    }
  }

  return {
    text: joinDistinct(await Promise.all(paths.map(readText))),
    notices:
      noticeFiles.length > 0
        ? distinct(await Promise.all(noticeFiles.sort().map((n) => readText(join(pkg.dir, n)))))
        : [],
  };
}

function distinct(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

function joinDistinct(texts: string[]): string | undefined {
  const parts = distinct(texts);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
