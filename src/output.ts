import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { EOL } from "node:os";
import { dirname } from "node:path";
import type { LineEnding } from "./core/types.js";
import { CliError } from "./errors.js";

export const systemLineEnding = (): LineEnding => (EOL === "\r\n" ? "crlf" : "lf");

/**
 * Writes the output. Replacing goes through a temp file and a rename, so a failure never leaves a
 * truncated file. Without `replace`, the file is created exclusively, so a file that appeared since
 * the overwrite check is never clobbered.
 */
export async function writeFileAtomic(path: string, text: string, replace = true): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (!replace) {
    try {
      await writeFile(path, text, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new CliError(`${path} already exists`, { hint: "pass --overwrite to replace it" });
      }
      throw error;
    }
    return;
  }
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, text, "utf8");
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
