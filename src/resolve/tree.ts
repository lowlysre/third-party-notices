import { join, sep } from "node:path";
import { CliError } from "../errors.js";
import { pathExists, readJson, realpathSafe } from "../fs.js";

export interface ResolvedPackage {
  name: string;
  version: string;
  /** Real path of the package directory. */
  dir: string;
  /** Declared SPDX-ish license expression, when present. */
  license: string | undefined;
  homepage: string | undefined;
  author: string | undefined;
}

export interface ResolveResult {
  packages: ResolvedPackage[];
  /** Production packages found outside node_modules (workspace/linked packages); not listed. */
  firstParty: string[];
}

interface PackageJson {
  name?: string;
  version?: string;
  license?: unknown;
  licenses?: unknown;
  homepage?: unknown;
  author?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface Edge {
  name: string;
  from: string;
  fromLabel: string;
  optional: boolean;
}

/**
 * Walks the production dependency graph of each input package.json by
 * applying Node's resolution algorithm to the installed node_modules.
 */
export async function resolveDependencies(inputs: string[]): Promise<ResolveResult> {
  const seen = new Map<string, ResolvedPackage>();
  const visitedDirs = new Set<string>();
  const firstParty = new Set<string>();
  const missing: string[] = [];
  let queue: Edge[] = [];
  const roots = new Set<string>();

  for (const input of inputs) {
    const file = await locatePackageJson(input);
    const dir = await realpathSafe(join(file, ".."));
    roots.add(dir);
    visitedDirs.add(dir);
    const json = await readJson<PackageJson>(file);
    const label = json.name ?? input;
    // Peers of the root are the consumer's responsibility, so they are not walked.
    queue.push(...edgesOf(json, dir, label, false));
  }

  while (queue.length > 0) {
    const batch = queue;
    queue = [];
    const resolved = await Promise.all(batch.map((edge) => resolveFrom(edge.from, edge.name)));
    for (const [index, found] of resolved.entries()) {
      const edge = batch[index] as Edge;
      if (!found) {
        if (!edge.optional) {
          missing.push(`${edge.name} (required by ${edge.fromLabel})`);
        }
        continue;
      }
      const dir = await realpathSafe(found);
      if (visitedDirs.has(dir)) {
        continue;
      }
      visitedDirs.add(dir);
      const json = await readJson<PackageJson>(join(found, "package.json"));
      const name = json.name ?? edge.name;
      const version = json.version ?? "0.0.0";
      const label = `${name}@${version}`;
      if (!dir.split(sep).includes("node_modules")) {
        if (!roots.has(dir)) {
          firstParty.add(label);
        }
      } else {
        seen.set(dir, {
          name,
          version,
          dir,
          license: declaredLicense(json),
          homepage: typeof json.homepage === "string" ? json.homepage : undefined,
          author: authorName(json.author),
        });
      }
      queue.push(...edgesOf(json, dir, label, true));
    }
  }

  if (missing.length > 0) {
    const shown = missing.slice(0, 8).map((m) => `  - ${m}`);
    const more = missing.length > shown.length ? [`  …and ${missing.length - shown.length} more`] : [];
    throw new CliError(
      `${missing.length} dependenc${missing.length === 1 ? "y is" : "ies are"} not installed:\n${[...shown, ...more].join("\n")}`,
      {
        hint: "run your package manager's install command first (npm install, pnpm install, yarn)",
      },
    );
  }

  const packages = [...seen.values()].sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version));
  return { packages, firstParty: [...firstParty].sort(compare) };
}

function edgesOf(json: PackageJson, dir: string, label: string, includePeers: boolean): Edge[] {
  const edges: Edge[] = [];
  for (const name of Object.keys(json.dependencies ?? {})) {
    edges.push({ name, from: dir, fromLabel: label, optional: false });
  }
  for (const name of Object.keys(json.optionalDependencies ?? {})) {
    edges.push({ name, from: dir, fromLabel: label, optional: true });
  }
  if (includePeers) {
    for (const name of Object.keys(json.peerDependencies ?? {})) {
      edges.push({ name, from: dir, fromLabel: label, optional: true });
    }
  }
  return edges;
}

async function locatePackageJson(input: string): Promise<string> {
  const direct = input.endsWith("package.json") ? input : join(input, "package.json");
  if (!(await pathExists(direct))) {
    throw new CliError(`Cannot find ${direct}`, {
      hint: "pass a package.json (or a directory containing one) with --input",
    });
  }
  return direct;
}

/** Node's lookup: check <dir>/node_modules/<name>, then each parent directory. */
export async function resolveFrom(startDir: string, name: string): Promise<string | undefined> {
  let current = startDir;
  for (;;) {
    const candidate = join(current, "node_modules", name);
    if (await pathExists(join(candidate, "package.json"))) {
      return candidate;
    }
    const parent = join(current, "..");
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function declaredLicense(json: PackageJson): string | undefined {
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string") {
      return (value as { type: string }).type;
    }
    return undefined;
  };
  if (Array.isArray(json.licenses)) {
    const all = json.licenses.map(pick).filter((v): v is string => v !== undefined);
    return all.length > 0 ? all.join(" OR ") : undefined;
  }
  return pick(json.license) ?? pick(json.licenses);
}

function authorName(author: unknown): string | undefined {
  if (typeof author === "string") {
    return author.replace(/\s*[<(].*$/, "").trim() || undefined;
  }
  if (author && typeof author === "object" && typeof (author as { name?: unknown }).name === "string") {
    return (author as { name: string }).name;
  }
  return undefined;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
