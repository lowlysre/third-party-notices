import { access, readFile, realpath } from "node:fs/promises";
import { CliError } from "./errors.js";

export async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** The real path, or the input when it can't be resolved. */
export async function realpathSafe(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}

/** UTF-8 text without a leading BOM. */
export async function readText(path: string): Promise<string> {
  const text = await readFile(path, "utf8");
  return text.startsWith("\ufeff") ? text.slice(1) : text;
}

/** Like `readText`, with a friendly error naming what was expected at `path`. */
export async function readExisting(path: string, what: string): Promise<string> {
  if (!(await pathExists(path))) throw new CliError(`${what} not found: ${path}`);
  return readText(path);
}

export async function readJson<T>(path: string): Promise<T> {
  const text = await readText(path);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new CliError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
}
