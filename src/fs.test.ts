import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CliError } from "./errors.js";
import { pathExists, readExisting, readJson, readText, realpathSafe } from "./fs.js";
import { writeFileAtomic } from "./output.js";
import { mapPool } from "./pool.js";
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
    const missing = join(await tempDir(t), "missing");
    assert.equal(await realpathSafe(missing), missing);
  });

  it("readExisting names what was expected when the file is missing", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "there.txt": "hi" });
    assert.equal(await readExisting(join(dir, "there.txt"), "Appended file"), "hi");
    await assert.rejects(readExisting(join(dir, "gone.txt"), "Appended file"), /Appended file not found: .*gone\.txt/);
  });
});

describe("writeFileAtomic", () => {
  it("creates parent directories and leaves no temp file", async (t) => {
    const target = join(await tempDir(t), "nested", "deep", "out.txt");
    await writeFileAtomic(target, "hello");
    assert.equal(await readFile(target, "utf8"), "hello");
    await assert.rejects(readFile(`${target}.${process.pid}.tmp`), { code: "ENOENT" });
  });

  it("refuses to replace an existing file unless told to", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "out.txt": "first" });
    await assert.rejects(
      writeFileAtomic(join(dir, "out.txt"), "second", false),
      (error: unknown) => error instanceof CliError && /already exists/.test(error.message),
    );
    assert.equal(await readFile(join(dir, "out.txt"), "utf8"), "first");
    await writeFileAtomic(join(dir, "new.txt"), "fresh", false);
    assert.equal(await readFile(join(dir, "new.txt"), "utf8"), "fresh");
  });

  it("cleans up and rethrows when the target cannot be replaced", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "taken/file.txt": "x" });
    await assert.rejects(writeFileAtomic(join(dir, "taken"), "hello"));
    await assert.rejects(readFile(join(dir, `taken.${process.pid}.tmp`)), { code: "ENOENT" });
  });
});

describe("mapPool", () => {
  it("keeps input order and never exceeds the concurrency limit", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapPool([30, 5, 20, 1, 10, 2], 2, async (ms) => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return ms * 2;
    });
    assert.deepEqual(results, [60, 10, 40, 2, 20, 4]);
    assert.equal(peak, 2);
  });

  it("handles an empty list", async () => {
    assert.deepEqual(await mapPool([], 4, async (x) => x), []);
  });
});
