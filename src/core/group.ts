import { createHash } from "node:crypto";
import { compare } from "./compare.js";
import type { LicensedPackage, ResolvedPackage } from "./types.js";

export interface LicenseGroup {
  text: string;
  notices: string[];
  /** `name@version` labels (or bare names), sorted and unique. */
  dependencies: string[];
}

export const normalizeEol = (text: string): string => text.replace(/\r\n?/g, "\n");

/** Groups packages whose license text and notices are identical, in a stable order. */
export function groupLicenses(packages: readonly LicensedPackage[], omitVersions: boolean): LicenseGroup[] {
  const groups = new Map<string, { text: string; notices: string[]; labels: Set<string> }>();
  for (const pkg of packages) {
    const text = normalizeEol(pkg.text).trim();
    const notices = pkg.notices.map((notice) => normalizeEol(notice).trim());
    const key = createHash("sha256").update(text).update("\0").update(notices.join("\0")).digest("hex");
    const label = omitVersions ? pkg.name : `${pkg.name}@${pkg.version}`;
    const group = groups.get(key) ?? { text, notices, labels: new Set<string>() };
    group.labels.add(label);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ text, notices, labels }) => ({ text, notices, dependencies: [...labels].sort(compare) }))
    .sort((a, b) => compare(a.text, b.text) || compare(a.dependencies.join(), b.dependencies.join()));
}

/** Package counts per declared license, most common first. */
export function licenseBreakdown(packages: readonly Pick<ResolvedPackage, "license">[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const { license } of packages) {
    counts.set(license ?? "Unknown", (counts.get(license ?? "Unknown") ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
}
