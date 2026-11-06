import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { installPackage, tempDir, writeFiles } from "./testing/fixtures.js";

const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

function cli(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "", FORCE_COLOR: "", CI: "", ...env },
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

async function project(t: Parameters<typeof tempDir>[0]): Promise<string> {
  const root = await tempDir(t);
  await writeFiles(root, { "package.json": { name: "app", version: "1.0.0", dependencies: { a: "1", b: "1" } } });
  await installPackage(root, "a", { files: { LICENSE: "MIT license text" }, license: "MIT" });
  await installPackage(root, "b", { files: { LICENSE: "MIT license text" }, license: "MIT" });
  return root;
}

describe("cli", () => {
  it("prints the version and help", async (t) => {
    const root = await tempDir(t);
    const version = await cli(root, ["--version"]);
    assert.equal(version.code, 0);
    assert.match(version.stdout, /^\d+\.\d+\.\d+\s*$/);

    const help = await cli(root, ["-h"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage/);
    assert.ok(!help.stdout.includes("\u001b"));
  });

  it("writes grouped notices to the default output file", async (t) => {
    const root = await project(t);
    const result = await cli(root, ["--ci", "--eol", "lf"]);
    assert.equal(result.code, 0, result.stderr);
    const text = await readFile(join(root, "third-party-licenses.txt"), "utf8");
    assert.match(text, /The following npm packages may be included in this product:\n\n - a@1\.0\.0\n - b@1\.0\.0/);
    assert.equal(text.match(/MIT license text/g)?.length, 1);
    assert.match(result.stderr, /Wrote third-party-licenses\.txt/);
    assert.ok(!result.stderr.includes("\u001b"));
  });

  it("writes only the document to stdout with -o -", async (t) => {
    const root = await project(t);
    const result = await cli(root, ["-o", "-", "--omit-versions", "--eol", "lf"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /^This file was generated with the third-party-notices npm package!/);
    assert.match(result.stdout, / - a\n - b\n/);
    assert.match(result.stderr, /Wrote stdout/);
  });

  it("refuses to overwrite without --overwrite when not interactive", async (t) => {
    const root = await project(t);
    await writeFile(join(root, "out.txt"), "keep");
    const refused = await cli(root, ["-o", "out.txt"]);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /error: out\.txt already exists/);
    assert.match(refused.stderr, /hint: {2}pass --overwrite/);
    assert.equal(await readFile(join(root, "out.txt"), "utf8"), "keep");

    const allowed = await cli(root, ["-o", "out.txt", "--overwrite", "--eol", "crlf"]);
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.ok((await readFile(join(root, "out.txt"), "utf8")).includes("\r\n"));
  });

  it("fails with --ci and lists every package without license text", async (t) => {
    const root = await project(t);
    await installPackage(root, "nolicense", { license: "MIT" });
    await installPackage(root, "alsonone");
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1", nolicense: "1", alsonone: "1" } },
    });
    const result = await cli(root, ["--ci"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /No license text found for 2 packages/);
    assert.match(result.stderr, /alsonone@1\.0\.0/);
    assert.match(result.stderr, /nolicense@1\.0\.0 \(declares MIT\)/);
  });

  it("applies config: exclude, replace and append", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1", skipme: "1", bare: "1" } },
      "bare-license.txt": "Bespoke license",
      "extra.txt": "Appended text",
      "third-party-notices.config.json": {
        exclude: ["skipme"],
        replace: { bare: "./bare-license.txt" },
        append: ["./extra.txt"],
        output: "NOTICES.txt",
      },
    });
    await installPackage(root, "a", { files: { LICENSE: "MIT" } });
    await installPackage(root, "skipme", { files: { LICENSE: "X" } });
    await installPackage(root, "bare");

    const result = await cli(root, ["--ci"]);
    assert.equal(result.code, 0, result.stderr);
    const text = await readFile(join(root, "NOTICES.txt"), "utf8");
    assert.ok(text.includes("Bespoke license"));
    assert.ok(text.includes("Appended text"));
    assert.ok(!text.includes("skipme"));
  });

  it("reports usage errors with exit code 2 and a suggestion", async (t) => {
    const root = await tempDir(t);
    const result = await cli(root, ["--overwite"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /error: Unknown option "--overwite"/);
    assert.match(result.stderr, /did you mean --overwrite\?/);
  });

  it("explains a missing node_modules", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { missing: "1" } } });
    const result = await cli(root, ["--ci"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /missing \(required by app\)/);
    assert.match(result.stderr, /hint: {2}run your package manager/);
  });

  it("is silent with --quiet", async (t) => {
    const root = await project(t);
    const result = await cli(root, ["--quiet"]);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
  });
});
