import { resolve } from "node:path";
import type { Category } from "./policy.js";
import type { Config } from "./schema.js";
import type { LineEnding } from "./types.js";

/** The settings a user can give on the command line. */
export interface Overrides {
  inputs: string[];
  output: string | undefined;
  eol: LineEnding | undefined;
  omitVersions: boolean;
  overwrite: boolean;
  allowMissing: boolean;
  failOn: Category[];
}

/** Everything a run needs, after the command line, the config file and the defaults are merged. */
export interface Settings {
  inputs: string[];
  /** Absolute path, or `-` for stdout. */
  output: string;
  lineEnding: LineEnding;
  omitVersions: boolean;
  overwrite: boolean;
  allowMissing: boolean;
  exclude: string[];
  allow: string[];
  append: string[];
  replace: Record<string, string>;
  /** Categories that make the run fail. */
  blocked: ReadonlySet<Category>;
}

/** The command line wins over the config file, which wins over the defaults. */
export function resolveSettings(args: Overrides, config: Config, cwd: string, systemLineEnding: LineEnding): Settings {
  const fromCwd = (path: string) => (path === "-" ? path : resolve(cwd, path));
  return {
    inputs: args.inputs.length > 0 ? args.inputs.map(fromCwd) : (config.inputs ?? [resolve(cwd, "package.json")]),
    output: args.output ? fromCwd(args.output) : (config.output ?? resolve(cwd, "third-party-licenses.txt")),
    lineEnding: args.eol ?? config.lineEnding ?? systemLineEnding,
    omitVersions: args.omitVersions || config.omitVersions === true,
    overwrite: args.overwrite || config.overwrite === true,
    allowMissing: args.allowMissing || config.allowMissing === true,
    exclude: config.exclude,
    allow: config.allow,
    append: config.append,
    replace: config.replace,
    blocked: new Set([...args.failOn, ...config.failOn]),
  };
}
