import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";
import { CliError } from "./errors.js";
import { tempDir, writeFiles } from "./testing/fixtures.js";

describe("loadConfig", () => {
  it("returns an empty config when nothing is found", async (t) => {
    const config = await loadConfig(await tempDir(t));
    assert.deepEqual([config.exclude, config.inputs], [[], undefined]);
  });

  it("prefers a config file over the package.json key", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "package.json": { thirdPartyNotices: { exclude: ["from-package"] } },
      "third-party-notices.config.json": { exclude: ["from-file"] },
    });
    assert.deepEqual((await loadConfig(dir)).exclude, ["from-file"]);
  });

  it("reads the package.json key", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "package.json": { thirdPartyNotices: { exclude: ["from-package"] } } });
    assert.deepEqual((await loadConfig(dir)).exclude, ["from-package"]);
  });

  it("loads .mjs configs exporting an object or a function", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "a.config.mjs": "export default { exclude: ['obj'] };",
      "b.config.mjs": "export default async () => ({ exclude: ['fn'] });",
    });
    assert.deepEqual((await loadConfig(dir, "a.config.mjs")).exclude, ["obj"]);
    assert.deepEqual((await loadConfig(dir, "b.config.mjs")).exclude, ["fn"]);
  });

  it("fails clearly for a missing, broken or invalid config", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "broken.config.mjs": "throw new Error('nope');",
      "array.json": "[]",
      "typo.json": { exlcude: [] },
    });
    await assert.rejects(loadConfig(dir, "missing.json"), /Config file not found/);
    await assert.rejects(loadConfig(dir, "broken.config.mjs"), /Could not load config .*nope/);
    await assert.rejects(loadConfig(dir, "array.json"), /Invalid config/);
    await assert.rejects(
      loadConfig(dir, "typo.json"),
      (error: unknown) => error instanceof CliError && /did you mean "exclude"/.test(error.message),
    );
  });
});
