import { createHash } from "node:crypto";

export interface LicensedPackage {
  name: string;
  version: string;
  text: string;
  notices: string[];
}

export interface LicenseGroup {
  text: string;
  notices: string[];
  /** Display labels ("name@1.0.0", or "name" with omitVersions), sorted and unique. */
  dependencies: string[];
}

export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Groups packages whose license text and notices are identical. */
export function groupLicenses(packages: LicensedPackage[], omitVersions: boolean): LicenseGroup[] {
  const groups = new Map<string, { text: string; notices: string[]; deps: Set<string> }>();
  for (const pkg of packages) {
    const text = normalizeEol(pkg.text).trim();
    const notices = pkg.notices.map((notice) => normalizeEol(notice).trim());
    const key = createHash("sha256").update(text).update("\0").update(notices.join("\0")).digest("hex");
    const label = omitVersions ? pkg.name : `${pkg.name}@${pkg.version}`;
    const group = groups.get(key);
    if (group) {
      group.deps.add(label);
    } else {
      groups.set(key, { text, notices, deps: new Set([label]) });
    }
  }
  return [...groups.values()]
    .map((group) => ({ text: group.text, notices: group.notices, dependencies: [...group.deps].sort(compare) }))
    .sort((a, b) => compare(a.text, b.text) || compare(a.dependencies.join(), b.dependencies.join()));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
