import { resolve } from "node:path";
import { CliError } from "../errors.js";
import { isValidPattern } from "./patterns.js";
import { CATEGORY_CHOICES, type Category, expandCategories } from "./policy.js";
import { didYouMean } from "./suggest.js";
import type { LineEnding } from "./types.js";

export interface Config {
  inputs: string[] | undefined;
  output: string | undefined;
  lineEnding: LineEnding | undefined;
  omitVersions: boolean | undefined;
  overwrite: boolean | undefined;
  allowMissing: boolean | undefined;
  append: string[];
  replace: Record<string, string>;
  exclude: string[];
  failOn: Category[];
  allow: string[];
}

const KEYS = [
  "inputs",
  "output",
  "lineEnding",
  "omitVersions",
  "overwrite",
  "allowMissing",
  "append",
  "replace",
  "exclude",
  "failOn",
  "allow",
] as const;

export const emptyConfig = (): Config => ({
  inputs: undefined,
  output: undefined,
  lineEnding: undefined,
  omitVersions: undefined,
  overwrite: undefined,
  allowMissing: undefined,
  append: [],
  replace: {},
  exclude: [],
  failOn: [],
  allow: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => (typeof value === "string" ? value : undefined);
const asBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const asLineEnding = (value: unknown) => (value === "lf" || value === "crlf" ? value : undefined);
const asStrings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : undefined;

/** Validates a parsed config. Relative paths resolve against `baseDir`. Reports every problem at once. */
export function validateConfig(raw: unknown, source: string, baseDir: string): Config {
  if (!isRecord(raw)) {
    throw new CliError(`Invalid config in ${source}`, { hint: "the config must be an object" });
  }
  const errors: string[] = [];
  const path = (file: string) => resolve(baseDir, file);

  const read = <T>(key: string, accept: (value: unknown) => T | undefined, expected: string): T | undefined => {
    if (raw[key] === undefined) return undefined;
    const value = accept(raw[key]);
    if (value === undefined) errors.push(`${key}: expected ${expected}`);
    return value;
  };

  const patterns = (key: "exclude" | "allow"): string[] => {
    const list = read(key, asStrings, "an array of strings") ?? [];
    for (const pattern of list.filter((entry) => !isValidPattern(entry))) {
      errors.push(`${key}: invalid regular expression ${pattern}`);
    }
    return list;
  };

  for (const key of Object.keys(raw).filter((name) => !(KEYS as readonly string[]).includes(name))) {
    const suggestion = didYouMean(key, KEYS);
    errors.push(`unknown key "${key}"${suggestion ? ` (did you mean "${suggestion}"?)` : ""}`);
  }

  const failOn = read(
    "failOn",
    (value) => {
      const list = asStrings(value);
      return list && expandCategories(list);
    },
    `license categories (${CATEGORY_CHOICES.join(", ")})`,
  );
  const replace = read(
    "replace",
    (value) => (isRecord(value) ? value : undefined),
    "an object mapping package to a file path",
  );

  const config: Config = {
    inputs: read("inputs", asStrings, "an array of strings")?.map(path),
    output: read("output", asString, "a string path"),
    lineEnding: read("lineEnding", asLineEnding, '"lf" or "crlf"'),
    omitVersions: read("omitVersions", asBoolean, "a boolean"),
    overwrite: read("overwrite", asBoolean, "a boolean"),
    allowMissing: read("allowMissing", asBoolean, "a boolean"),
    append: read("append", asStrings, "an array of strings")?.map(path) ?? [],
    replace: {},
    exclude: patterns("exclude"),
    failOn: failOn ?? [],
    allow: patterns("allow"),
  };
  if (config.output && config.output !== "-") config.output = path(config.output);

  for (const [name, file] of Object.entries(replace ?? {})) {
    if (typeof file === "string") config.replace[name] = path(file);
    else errors.push(`replace.${name}: expected a string path`);
  }

  if (errors.length > 0) {
    throw new CliError(`Invalid config in ${source}:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  }
  return config;
}
