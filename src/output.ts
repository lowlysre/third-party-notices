import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { EOL } from "node:os";
import { dirname } from "node:path";
import type { LineEnding } from "./core/types.js";

export const systemLineEnding = (): LineEnding => (EOL === "\r\n" ? "crlf" : "lf");

/** Writes through a temp file and a rename, so a failure never leaves a truncated output. */
export async function writeFileAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, text, "utf8");
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
