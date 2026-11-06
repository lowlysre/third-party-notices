import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readText } from "../fs.js";
import { isLicenseFileName, isNoticeFileName, isReadableText, licenseRank } from "./names.js";
import type { ResolvedPackage } from "./tree.js";

export { isLicenseFileName, isNoticeFileName };

export interface LicenseInfo {
  text: string | undefined;
  notices: string[];
}

function byRank(a: string, b: string): number {
  return (licenseRank(a) ?? 0) - (licenseRank(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
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

  licenseFiles.sort(byRank);
  const paths = licenseFiles.map((name) => join(pkg.dir, name));
  for (const dirName of licenseDirs.sort()) {
    const inner = await readdir(join(pkg.dir, dirName), { withFileTypes: true });
    for (const entry of inner.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.isFile() && isReadableText(entry.name)) {
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
