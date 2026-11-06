import type { Dirent } from "node:fs";
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

const distinct = (texts: readonly string[]): string[] => [
  ...new Set(texts.map((text) => text.replace(/\r\n?/g, "\n").trim()).filter(Boolean)),
];
const byRank = (a: string, b: string): number => (licenseRank(a) ?? 0) - (licenseRank(b) ?? 0) || compare(a, b);
const filesNamed = (entries: readonly Dirent[], keep: (name: string) => boolean) =>
  entries.filter((entry) => !entry.isDirectory() && keep(entry.name)).map((entry) => entry.name);
const readAll = (dir: string, files: readonly string[]) => Promise.all(files.map((file) => readText(join(dir, file))));
const readNotices = async (dir: string, entries: readonly Dirent[]) =>
  distinct(await readAll(dir, filesNamed(entries, isNoticeFileName).sort(compare)));

/** License text from the package's license files (best match first, duplicates merged) and NOTICE files. */
export async function readLicense(dir: string): Promise<LicenseInfo> {
  const entries = await readdir(dir, { withFileTypes: true });
  const rootFiles = filesNamed(entries, isLicenseFileName).sort(byRank);
  const nestedFiles: string[] = [];
  for (const folder of entries.filter((entry) => entry.isDirectory() && /^licen[sc]es$/i.test(entry.name))) {
    const inner = await readdir(join(dir, folder.name), { withFileTypes: true });
    const names = filesNamed(inner, isLicensesDirFile).sort(compare);
    nestedFiles.push(...names.map((name) => join(folder.name, name)));
  }

  const text = distinct(await readAll(dir, [...rootFiles, ...nestedFiles])).join("\n\n");
  return { text: text || undefined, notices: await readNotices(dir, entries) };
}

/** The `replace` file from the config when there is one, else the package's own license files. */
export async function licenseFor(
  pkg: ResolvedPackage,
  replace: Readonly<Record<string, string>>,
): Promise<LicenseInfo> {
  const own = (key: string) => (Object.hasOwn(replace, key) ? replace[key] : undefined);
  const replacement = own(packageLabel(pkg)) ?? own(pkg.name);
  if (replacement === undefined) return readLicense(pkg.dir);
  const text = (await readExisting(replacement, `Replacement license for ${pkg.name}`)).trim();
  // A replacement swaps the license text only; the package's NOTICE files still apply.
  return {
    text: text || undefined,
    notices: await readNotices(pkg.dir, await readdir(pkg.dir, { withFileTypes: true })),
  };
}
