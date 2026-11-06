import { CliError } from "../errors.js";
import { printable } from "./manifest.js";
import { CATEGORY_LABELS, type Finding } from "./policy.js";
import type { ResolvedPackage } from "./types.js";

type Named = Pick<ResolvedPackage, "name" | "version">;

export const packageLabel = ({ name, version }: Named): string => `${name}@${version}`;

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** `  - a`, one per line, capped with `…and N more`. Items can hold package metadata, so control characters are dropped. */
function bullets(items: readonly string[], limit: number): string {
  const lines = items.slice(0, limit).map((item) => `  - ${printable(item)}`);
  if (items.length > limit) lines.push(`  …and ${items.length - limit} more`);
  return lines.join("\n");
}

/** Where to reach the people behind a package. */
export const contactUrl = (pkg: ResolvedPackage): string | undefined => pkg.homepage ?? pkg.repository;

/** Why a package has no license text, with a nudge to ask the maintainers. */
export function missingFileNote(pkg: ResolvedPackage): string {
  const state = pkg.license
    ? `declares ${pkg.license} but ships no license file`
    : "declares no license and ships no license file";
  const url = contactUrl(pkg);
  return `${state}; consider asking the maintainers to add one${url ? ` (${url})` : ""}`;
}

export function unresolvedError(unresolved: readonly ResolvedPackage[]): CliError {
  const items = unresolved.map((pkg) => `${packageLabel(pkg)}${pkg.license ? ` (declares ${pkg.license})` : ""}`);
  return new CliError(
    `No license text found for ${items.length} ${plural(items.length, "package", "packages")}:\n${bullets(items, 10)}`,
    {
      hint: 'supply the text with "replace" in the config file, exclude the package, pass --allow-missing, run without --ci to be prompted, or ask the maintainers to ship a license file',
    },
  );
}

export function policyError(failing: readonly Finding[]): CliError {
  const categories = [...new Set(failing.map((finding) => CATEGORY_LABELS[finding.category]))].join(", ");
  const items = failing.map((finding) => `${packageLabel(finding)} (${finding.id})`);
  return new CliError(
    `${items.length} ${plural(items.length, "package", "packages")} in blocked license categories (${categories}):\n${bullets(items, 5)}`,
    { hint: 'review them, or list them under "allow" in the config file' },
  );
}

export function missingDependenciesError(missing: readonly string[]): CliError {
  return new CliError(
    `${missing.length} ${plural(missing.length, "dependency is", "dependencies are")} not installed:\n${bullets(missing, 8)}`,
    { hint: "run your package manager's install command first (npm install, pnpm install, yarn)" },
  );
}
