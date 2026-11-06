import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfig, matchesPackage, validateConfig } from "./config.js";
import { CliError } from "./errors.js";
import { tempDir, writeFiles } from "./testing/fixtures.js";

describe("validateConfig", () => {
  it("accepts a full config and resolves paths against the base directory", () => {
    const base = join("C:", "base");
    const config = validateConfig(
      {
        inputs: ["a/package.json"],
        output: "out.txt",
        lineEnding: "crlf",
        omitVersions: true,
        append: ["extra.txt"],
        replace: { "pkg@1.0.0": "lic.txt" },
        exclude: ["x", "/^@types\\//i"],
      },
      "cfg",
      base,
    );
    assert.equal(config.lineEnding, "crlf");
    assert.equal(config.omitVersions, true);
    assert.deepEqual(config.inputs, [join(base, "a", "package.json")]);
    assert.equal(config.output, join(base, "out.txt"));
    assert.equal(config.replace["pkg@1.0.0"], join(base, "lic.txt"));
  });

  it("reports every problem with a path and suggests typo fixes", () => {
    assert.throws(
      () => validateConfig({ lineEnding: "cr", omitVerions: true, exclude: [1], replace: { a: 1 } }, "cfg", "."),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /unknown key "omitVerions" \(did you mean "omitVersions"\?\)/);
        assert.match(error.message, /lineEnding: expected "lf" or "crlf"/);
        assert.match(error.message, /exclude: expected an array of strings/);
        assert.match(error.message, /replace\.a: expected a string path/);
        return true;
      },
    );
  });

  it("accepts failOn and allow", () => {
    const config = validateConfig(
      { failOn: ["copyleft", "restricted"], allow: ["a", "b@1.0.0", "/^@types\\//"] },
      "cfg",
      ".",
    );
    assert.deepEqual(config.failOn, ["weak-copyleft", "strong-copyleft", "network-copyleft", "restricted"]);
    assert.deepEqual(config.allow, ["a", "b@1.0.0", "/^@types\\//"]);
  });

  it("rejects unknown failOn categories and invalid allow expressions", () => {
    assert.throws(
      () => validateConfig({ failOn: ["nope"], allow: ["/(/"] }, "cfg", "."),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /failOn: expected license categories/);
        assert.match(error.message, /allow: invalid regular expression/);
        return true;
      },
    );
  });

  it("rejects invalid exclude regular expressions", () => {
    assert.throws(() => validateConfig({ exclude: ["/(/"] }, "cfg", "."), /invalid regular expression/);
  });

  it("rejects wrong types for scalar keys and lists", () => {
    assert.throws(
      () => validateConfig({ inputs: "a", output: 5, omitVersions: "yes", overwrite: 1, replace: [] }, "cfg", "."),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        for (const expected of [
          /inputs: expected an array/,
          /output: expected a string path/,
          /omitVersions: expected a boolean/,
          /overwrite: expected a boolean/,
          /replace: expected an object/,
        ]) {
          assert.match(error.message, expected);
        }
        return true;
      },
    );
  });

  it("keeps a stdout output as-is and has no suggestion for unrelated keys", () => {
    assert.equal(validateConfig({ output: "-" }, "cfg", ".").output, "-");
    assert.throws(
      () => validateConfig({ zzzzzzzzzz: 1 }, "cfg", "."),
      (error: unknown) => error instanceof CliError && !/did you mean/.test(error.message),
    );
  });
});

describe("matchesPackage", () => {
  it("matches names, name@version and regular expressions", () => {
    assert.equal(matchesPackage("a", "a", "1.0.0"), true);
    assert.equal(matchesPackage("a@1.0.0", "a", "1.0.0"), true);
    assert.equal(matchesPackage("a@2.0.0", "a", "1.0.0"), false);
    assert.equal(matchesPackage("/^@types\\//", "@types/node", "1.0.0"), true);
    assert.equal(matchesPackage("/PRETTIER/i", "prettier-x", "1.0.0"), true);
    assert.equal(matchesPackage("b", "a", "1.0.0"), false);
  });
});

describe("loadConfig", () => {
  it("returns an empty config when nothing is found", async (t) => {
    const dir = await tempDir(t);
    const { config, source } = await loadConfig(dir);
    assert.equal(source, undefined);
    assert.deepEqual(config.exclude, []);
  });

  it("prefers a config file over the package.json key", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "package.json": { thirdPartyNotices: { exclude: ["from-package"] } },
      "third-party-notices.config.json": { exclude: ["from-file"] },
    });
    assert.deepEqual((await loadConfig(dir)).config.exclude, ["from-file"]);
  });

  it("reads the package.json key", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "package.json": { thirdPartyNotices: { exclude: ["from-package"] } } });
    assert.deepEqual((await loadConfig(dir)).config.exclude, ["from-package"]);
  });

  it("loads .mjs configs exporting an object or a function", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "a.config.mjs": "export default { exclude: ['obj'] };",
      "b.config.mjs": "export default async () => ({ exclude: ['fn'] });",
    });
    assert.deepEqual((await loadConfig(dir, "a.config.mjs")).config.exclude, ["obj"]);
    assert.deepEqual((await loadConfig(dir, "b.config.mjs")).config.exclude, ["fn"]);
  });

  it("reports load errors from .mjs configs and non-object configs", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "broken.config.mjs": "throw new Error('nope');",
      "array.config.json": "[]",
    });
    await assert.rejects(loadConfig(dir, "broken.config.mjs"), /Could not load config .*nope/);
    await assert.rejects(loadConfig(dir, "array.config.json"), /Invalid config/);
  });

  it("fails clearly for a missing explicit config", async (t) => {
    const dir = await tempDir(t);
    await assert.rejects(loadConfig(dir, "missing.json"), /Config file not found/);
  });
});
