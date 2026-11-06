import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

/** Creates a temp directory that is removed when the test finishes. */
export async function tempDir(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tpn-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export async function writeFiles(root: string, files: Record<string, string | object>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
}

/** Installs a fake package at <root>/node_modules/<name> (or any base directory). */
export async function installPackage(
  base: string,
  name: string,
  options: { files?: Record<string, string>; [manifestField: string]: unknown } = {},
): Promise<string> {
  const dir = join(base, "node_modules", name);
  const { files = {}, ...manifest } = options;
  await writeFiles(dir, {
    "package.json": { name, version: "1.0.0", ...manifest },
    ...files,
  });
  return dir;
}

export async function link(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path, "junction");
}
