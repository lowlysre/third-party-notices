import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type Config, emptyConfig, validateConfig } from "./core/schema.js";
import { CliError } from "./errors.js";
import { pathExists, readJson } from "./fs.js";

const CONFIG_FILES = ["third-party-notices.config.json", "third-party-notices.config.mjs"];
const PACKAGE_JSON_KEY = "thirdPartyNotices";

async function readConfigFile(file: string): Promise<Config> {
  if (!/\.[cm]?js$/.test(file)) {
    return validateConfig(await readJson<unknown>(file), file, dirname(file));
  }
  try {
    const { default: exported } = (await import(pathToFileURL(file).href)) as { default?: unknown };
    const raw = typeof exported === "function" ? await exported() : exported;
    return validateConfig(raw, file, dirname(file));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`Could not load config ${file}: ${(error as Error).message}`);
  }
}

/**
 * Loads the config: `explicit` if given, else `third-party-notices.config.json` or `.mjs`,
 * else the `thirdPartyNotices` key of `package.json`, else an empty config.
 */
export async function loadConfig(cwd: string, explicit?: string): Promise<Config> {
  if (explicit) {
    const file = resolve(cwd, explicit);
    if (!(await pathExists(file))) throw new CliError(`Config file not found: ${file}`);
    return readConfigFile(file);
  }
  for (const name of CONFIG_FILES) {
    if (await pathExists(resolve(cwd, name))) return readConfigFile(resolve(cwd, name));
  }
  const manifestPath = resolve(cwd, "package.json");
  if (await pathExists(manifestPath)) {
    const manifest = await readJson<Record<string, unknown>>(manifestPath);
    if (PACKAGE_JSON_KEY in manifest) {
      return validateConfig(manifest[PACKAGE_JSON_KEY], `${manifestPath}#${PACKAGE_JSON_KEY}`, cwd);
    }
  }
  return emptyConfig();
}
