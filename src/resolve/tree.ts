import { dirname, join, sep } from "node:path";
import { compare } from "../core/compare.js";
import { describePackage, type Manifest } from "../core/manifest.js";
import { missingDependenciesError } from "../core/messages.js";
import type { ResolvedPackage } from "../core/types.js";
import { CliError } from "../errors.js";
import { pathExists, readJson, realpathSafe } from "../fs.js";

export interface ResolveResult {
  packages: ResolvedPackage[];
  /** Linked packages found outside `node_modules` (workspace members). Not listed, but their dependencies are. */
  firstParty: string[];
}

interface Edge {
  name: string;
  /** Directory the lookup starts from. */
  from: string;
  requester: string;
  optional: boolean;
}

const names = (deps: Record<string, string> | undefined) => Object.keys(deps ?? {});

function edgesOf(manifest: Manifest, from: string, requester: string, includePeers: boolean): Edge[] {
  const edge =
    (optional: boolean) =>
    (name: string): Edge => ({ name, from, requester, optional });
  // npm lets an optional declaration override a required one of the same name.
  const required = names(manifest.dependencies).filter(
    (name) => !Object.hasOwn(manifest.optionalDependencies ?? {}, name),
  );
  return [
    ...required.map(edge(false)),
    ...names(manifest.optionalDependencies).map(edge(true)),
    ...(includePeers ? names(manifest.peerDependencies).map(edge(true)) : []),
  ];
}

async function locatePackageJson(input: string): Promise<string> {
  const file = input.endsWith("package.json") ? input : join(input, "package.json");
  if (!(await pathExists(file))) {
    throw new CliError(`Cannot find ${file}`, {
      hint: "pass a package.json (or a directory containing one) with --input",
    });
  }
  return file;
}

/** Node's lookup: `<dir>/node_modules/<name>`, then the same in each parent directory. */
export async function resolveFrom(startDir: string, name: string): Promise<string | undefined> {
  for (let dir = startDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (await pathExists(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return undefined;
  }
}

/**
 * Walks the production dependencies of each input `package.json` through the installed
 * `node_modules`, breadth first. Packages are keyed by real path, which collapses symlinked
 * (pnpm) layouts and breaks cycles.
 */
export async function resolveDependencies(inputs: readonly string[]): Promise<ResolveResult> {
  const found = new Map<string, ResolvedPackage>();
  const visited = new Set<string>();
  const roots = new Set<string>();
  const firstParty = new Set<string>();
  const missing: string[] = [];
  let queue: Edge[] = [];

  for (const input of inputs) {
    const file = await locatePackageJson(input);
    const dir = await realpathSafe(join(file, ".."));
    const manifest = await readJson<Manifest>(file);
    roots.add(dir);
    visited.add(dir);
    // A project's own peers are its consumer's responsibility, so they aren't walked.
    queue.push(...edgesOf(manifest, dir, manifest.name ?? input, false));
  }

  while (queue.length > 0) {
    const batch = queue;
    queue = [];
    const locations = await Promise.all(batch.map((edge) => resolveFrom(edge.from, edge.name)));
    for (const [index, location] of locations.entries()) {
      const edge = batch[index] as Edge;
      if (!location) {
        if (!edge.optional) missing.push(`${edge.name} (required by ${edge.requester})`);
        continue;
      }
      const dir = await realpathSafe(location);
      if (visited.has(dir)) continue;
      visited.add(dir);

      const manifest = await readJson<Manifest>(join(location, "package.json"));
      const pkg = describePackage(manifest, dir, edge.name);
      const label = `${pkg.name}@${pkg.version}`;
      if (dir.split(sep).includes("node_modules")) found.set(dir, pkg);
      else if (!roots.has(dir)) firstParty.add(label);
      queue.push(...edgesOf(manifest, dir, label, true));
    }
  }

  if (missing.length > 0) throw missingDependenciesError(missing);

  const packages = [...found.values()].sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version));
  return { packages, firstParty: [...firstParty].sort(compare) };
}
