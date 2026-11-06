import { access, readFile, realpath } from "node:fs/promises";
import { CliError } from "./errors.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function realpathSafe(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

/** Reads UTF-8 text, stripping a leading BOM. */
export async function readText(path: string): Promise<string> {
  const text = await readFile(path, "utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function readJson<T>(path: string): Promise<T> {
  const text = await readText(path);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new CliError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
}
