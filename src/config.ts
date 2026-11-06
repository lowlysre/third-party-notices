import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CliError, didYouMean } from "./errors.js";
import { pathExists, readJson } from "./fs.js";
import { CATEGORY_CHOICES, type Category, expandCategories } from "./policy.js";

export interface Config {
  inputs: string[] | undefined;
  output: string | undefined;
  lineEnding: "lf" | "crlf" | undefined;
  omitVersions: boolean | undefined;
  overwrite: boolean | undefined;
  allowMissing: boolean | undefined;
  append: string[];
  replace: Record<string, string>;
  exclude: string[];
  failOn: Category[];
  allow: string[];
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the file the config came from, when any. */
  source: string | undefined;
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
const CONFIG_FILES = ["third-party-notices.config.json", "third-party-notices.config.mjs"];
export const PACKAGE_JSON_KEY = "thirdPartyNotices";

export function emptyConfig(): Config {
  return {
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
  };
}

export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig> {
  if (explicitPath) {
    const file = resolve(cwd, explicitPath);
    if (!(await pathExists(file))) {
      throw new CliError(`Config file not found: ${file}`);
    }
    return readConfigFile(file);
  }
  for (const name of CONFIG_FILES) {
    const file = resolve(cwd, name);
    if (await pathExists(file)) {
      return readConfigFile(file);
    }
  }
  const pkgFile = resolve(cwd, "package.json");
  if (await pathExists(pkgFile)) {
    const pkg = await readJson<Record<string, unknown>>(pkgFile);
    if (PACKAGE_JSON_KEY in pkg) {
      return {
        config: validateConfig(pkg[PACKAGE_JSON_KEY], `${pkgFile}#${PACKAGE_JSON_KEY}`, dirname(pkgFile)),
        source: pkgFile,
      };
    }
  }
  return { config: emptyConfig(), source: undefined };
}

async function readConfigFile(file: string): Promise<LoadedConfig> {
  let raw: unknown;
  if (file.endsWith(".mjs") || file.endsWith(".js") || file.endsWith(".cjs")) {
    try {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
      raw = typeof mod.default === "function" ? await (mod.default as () => unknown)() : mod.default;
    } catch (error) {
      throw new CliError(`Could not load config ${file}: ${(error as Error).message}`);
    }
  } else {
    raw = await readJson<unknown>(file);
  }
  return { config: validateConfig(raw, file, dirname(file)), source: file };
}

/** Validates a raw config value; paths are resolved relative to baseDir. */
export function validateConfig(raw: unknown, source: string, baseDir: string): Config {
  const errors: string[] = [];
  const config = emptyConfig();

  if (!isRecord(raw)) {
    throw new CliError(`Invalid config in ${source}`, { hint: "the config must be an object" });
  }

  for (const key of Object.keys(raw)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      const suggestion = didYouMean(key, KEYS);
      errors.push(`unknown key "${key}"${suggestion ? ` (did you mean "${suggestion}"?)` : ""}`);
    }
  }

  const stringArray = (key: string): string[] | undefined => {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      errors.push(`${key}: expected an array of strings`);
      return undefined;
    }
    return value as string[];
  };

  const inputs = stringArray("inputs");
  if (inputs) config.inputs = inputs.map((path) => resolve(baseDir, path));
  config.append = (stringArray("append") ?? []).map((path) => resolve(baseDir, path));
  config.exclude = stringArray("exclude") ?? [];
  for (const pattern of config.exclude) {
    if (isRegexPattern(pattern) && !compileRegex(pattern)) {
      errors.push(`exclude: invalid regular expression ${pattern}`);
    }
  }
  config.allow = stringArray("allow") ?? [];
  for (const pattern of config.allow) {
    if (isRegexPattern(pattern) && !compileRegex(pattern)) {
      errors.push(`allow: invalid regular expression ${pattern}`);
    }
  }
  const failOn = stringArray("failOn");
  if (failOn) {
    const categories = expandCategories(failOn);
    if (categories) config.failOn = categories;
    else errors.push(`failOn: expected license categories (${CATEGORY_CHOICES.join(", ")})`);
  }

  if (raw.output !== undefined) {
    if (typeof raw.output === "string") config.output = raw.output === "-" ? "-" : resolve(baseDir, raw.output);
    else errors.push("output: expected a string path");
  }
  if (raw.lineEnding !== undefined) {
    if (raw.lineEnding === "lf" || raw.lineEnding === "crlf") config.lineEnding = raw.lineEnding;
    else errors.push('lineEnding: expected "lf" or "crlf"');
  }
  for (const key of ["omitVersions", "overwrite", "allowMissing"] as const) {
    const value = raw[key];
    if (value !== undefined) {
      if (typeof value === "boolean") config[key] = value;
      else errors.push(`${key}: expected a boolean`);
    }
  }
  if (raw.replace !== undefined) {
    if (!isRecord(raw.replace)) {
      errors.push("replace: expected an object mapping package to a file path");
    } else {
      for (const [pkg, file] of Object.entries(raw.replace)) {
        if (typeof file === "string") config.replace[pkg] = resolve(baseDir, file);
        else errors.push(`replace.${pkg}: expected a string path`);
      }
    }
  }

  if (errors.length > 0) {
    throw new CliError(`Invalid config in ${source}:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRegexPattern(pattern: string): boolean {
  return /^\/.+\/[a-z]*$/.test(pattern);
}

function compileRegex(pattern: string): RegExp | undefined {
  const match = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (!match) return undefined;
  try {
    return new RegExp(match[1] as string, match[2]);
  } catch {
    return undefined;
  }
}

/** Matches "name", "name@version" or "/regex/flags" against a package. */
export function matchesPackage(pattern: string, name: string, version: string): boolean {
  if (isRegexPattern(pattern)) {
    return compileRegex(pattern)?.test(name) ?? false;
  }
  return pattern === name || pattern === `${name}@${version}`;
}
