import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CliError, didYouMean, UsageError } from "./errors.js";
import { pathExists, readJson, readText, realpathSafe } from "./fs.js";
import { writeFileAtomic } from "./output.js";
import { tempDir, writeFiles } from "./testing/fixtures.js";

describe("fs helpers", () => {
  it("strips a BOM and parses JSON", async (t) => {
    const dir = await tempDir(t);
    await writeFile(join(dir, "a.json"), '\ufeff{"a":1}');
    assert.equal(await readText(join(dir, "a.json")), '{"a":1}');
    assert.deepEqual(await readJson(join(dir, "a.json")), { a: 1 });
    assert.equal(await pathExists(join(dir, "a.json")), true);
    assert.equal(await pathExists(join(dir, "nope")), false);
  });

  it("names the file when JSON is invalid", async (t) => {
    const dir = await tempDir(t);
    await writeFile(join(dir, "bad.json"), "{nope");
    await assert.rejects(
      readJson(join(dir, "bad.json")),
      (error: unknown) => error instanceof CliError && /Invalid JSON in .*bad\.json/.test(error.message),
    );
  });

  it("returns the input when a path cannot be resolved", async (t) => {
    const dir = await tempDir(t);
    const missing = join(dir, "missing");
    assert.equal(await realpathSafe(missing), missing);
  });
});

describe("writeFileAtomic", () => {
  it("creates parent directories and leaves no temp file", async (t) => {
    const dir = await tempDir(t);
    const target = join(dir, "nested", "deep", "out.txt");
    await writeFileAtomic(target, "hello");
    assert.equal(await readFile(target, "utf8"), "hello");
    await assert.rejects(readFile(`${target}.${process.pid}.tmp`), { code: "ENOENT" });
  });

  it("cleans up and rethrows when the target cannot be replaced", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "taken/file.txt": "x" });
    await assert.rejects(writeFileAtomic(join(dir, "taken"), "hello"));
    await assert.rejects(readFile(join(dir, `taken.${process.pid}.tmp`)), { code: "ENOENT" });
  });
});

describe("errors", () => {
  it("UsageError carries exit code 2 and an optional hint", () => {
    assert.equal(new UsageError("x").exitCode, 2);
    assert.equal(new UsageError("x").hint, undefined);
    assert.equal(new UsageError("x", "try y").hint, "try y");
  });

  it("didYouMean only suggests close matches", () => {
    assert.equal(didYouMean("outpt", ["output", "input"]), "output");
    assert.equal(didYouMean("zzzzzzzz", ["output", "input"]), undefined);
  });
});
