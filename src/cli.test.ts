import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { installPackage, tempDir, writeFiles } from "./testing/fixtures.js";

// End-to-end through the real entry point: exit codes and which stream gets what.
const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

function cli(cwd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "", FORCE_COLOR: "", CI: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function project(t: Parameters<typeof tempDir>[0], license = "MIT", text: string | null = "License text") {
  const root = await tempDir(t);
  await writeFiles(root, { "package.json": { name: "app", version: "1.0.0", dependencies: { dep: "1" } } });
  await installPackage(root, "dep", { license, files: text === null ? {} : { LICENSE: text } });
  return root;
}

describe("cli", () => {
  it("prints the version and plain help to stdout", async (t) => {
    const root = await tempDir(t);
    const version = await cli(root, ["--version"]);
    assert.deepEqual([version.code, /^\d+\.\d+\.\d+/.test(version.stdout)], [0, true]);
    const help = await cli(root, ["-h"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage/);
    assert.ok(!help.stdout.includes("\u001b"));
  });

  it("writes the default output file and reports on stderr", async (t) => {
    const root = await project(t);
    const result = await cli(root, ["--ci", "--eol", "lf"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(root, "third-party-licenses.txt"), "utf8"), /dep@1\.0\.0[\s\S]*License text/);
    assert.match(result.stderr, /Wrote third-party-licenses\.txt/);
    assert.ok(!result.stderr.includes("\u001b"));
    assert.equal(result.stdout, "");
  });

  it("keeps stdout for the document alone with -o -", async (t) => {
    const result = await cli(await project(t), ["-o", "-", "--eol", "lf"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /^This file was generated with the third-party-notices npm package!/);
    assert.match(result.stderr, /Wrote stdout/);
  });

  it("prints nothing with --quiet", async (t) => {
    const result = await cli(await project(t), ["--quiet"]);
    assert.deepEqual([result.code, result.stderr], [0, ""]);
  });

  it("exits 1 when --ci finds a package without license text, and 0 with --allow-missing", async (t) => {
    const root = await project(t, "MIT", null);
    const failed = await cli(root, ["--ci", "-o", "-"]);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /error: No license text found for 1 package/);
    const allowed = await cli(root, ["--ci", "--allow-missing", "-o", "-"]);
    assert.equal(allowed.code, 0, allowed.stderr);
  });

  it("exits 1 for a blocked license category, after writing the notice", async (t) => {
    const root = await project(t, "GPL-3.0-only");
    const result = await cli(root, ["--ci", "-o", "-", "--fail-on", "copyleft"]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /License text/);
    assert.match(result.stderr, /error: 1 package in blocked license categories \(Strong copyleft\)/);
  });

  it("exits 2 for usage errors, with a suggestion", async (t) => {
    const result = await cli(await tempDir(t), ["--overwite"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /error: Unknown option "--overwite"\nhint: {2}did you mean --overwrite\?/);
  });
});
