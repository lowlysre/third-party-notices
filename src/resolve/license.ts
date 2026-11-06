import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { compare } from "../core/compare.js";
import { packageLabel } from "../core/messages.js";
import { isLicenseFileName, isLicensesDirFile, isNoticeFileName, licenseRank } from "../core/names.js";
import type { ResolvedPackage } from "../core/types.js";
import { readExisting, readText } from "../fs.js";

export interface LicenseInfo {
  text: string | undefined;
  /** Contents of NOTICE files, which Apache-style licenses require to be carried along. */
  notices: string[];
}

const distinct = (texts: readonly string[]): string[] => [...new Set(texts.map((text) => text.trim()).filter(Boolean))];
const byRank = (a: string, b: string): number => (licenseRank(a) ?? 0) - (licenseRank(b) ?? 0) || compare(a, b);

/** License text from the package's license files (best match first, duplicates merged) and NOTICE files. */
export async function readLicense(dir: string): Promise<LicenseInfo> {
  const entries = await readdir(dir, { withFileTypes: true });
  const named = (keep: (name: string) => boolean) =>
    entries.filter((entry) => !entry.isDirectory() && keep(entry.name)).map((entry) => entry.name);

  const rootFiles = named(isLicenseFileName).sort(byRank);
  const noticeFiles = named(isNoticeFileName).sort(compare);
  const nestedFiles: string[] = [];
  for (const folder of entries.filter((entry) => entry.isDirectory() && /^licen[sc]es$/i.test(entry.name))) {
    const inner = await readdir(join(dir, folder.name), { withFileTypes: true });
    const names = inner
      .filter((entry) => !entry.isDirectory() && isLicensesDirFile(entry.name))
      .map((entry) => entry.name);
    nestedFiles.push(...names.sort(compare).map((name) => join(folder.name, name)));
  }

  const read = (files: readonly string[]) => Promise.all(files.map((file) => readText(join(dir, file))));
  const text = distinct(await read([...rootFiles, ...nestedFiles])).join("\n\n");
  return { text: text || undefined, notices: distinct(await read(noticeFiles)) };
}

/** The `replace` file from the config when there is one, else the package's own license files. */
export async function licenseFor(
  pkg: ResolvedPackage,
  replace: Readonly<Record<string, string>>,
): Promise<LicenseInfo> {
  const replacement = replace[packageLabel(pkg)] ?? replace[pkg.name];
  if (replacement === undefined) return readLicense(pkg.dir);
  return { text: await readExisting(replacement, `Replacement license for ${pkg.name}`), notices: [] };
}
