import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { CliError } from "../errors.js";
import { validateConfig } from "./schema.js";

const base = resolve("base");

describe("validateConfig", () => {
  it("accepts a full config and resolves paths against the base directory", () => {
    const config = validateConfig(
      {
        inputs: ["a/package.json"],
        output: "out.txt",
        lineEnding: "crlf",
        omitVersions: true,
        overwrite: false,
        allowMissing: true,
        append: ["extra.txt"],
        replace: { "pkg@1.0.0": "lic.txt" },
        exclude: ["x", "/^@types\\//i"],
        allow: ["y@1.0.0"],
        failOn: ["copyleft", "restricted"],
      },
      "cfg",
      base,
    );
    assert.deepEqual(config.inputs, [join(base, "a", "package.json")]);
    assert.equal(config.output, join(base, "out.txt"));
    assert.deepEqual(config.append, [join(base, "extra.txt")]);
    assert.equal(config.replace["pkg@1.0.0"], join(base, "lic.txt"));
    assert.deepEqual(config.failOn, ["weak-copyleft", "strong-copyleft", "network-copyleft", "restricted"]);
    assert.deepEqual([config.lineEnding, config.omitVersions, config.allowMissing], ["crlf", true, true]);
    assert.deepEqual([config.exclude, config.allow], [["x", "/^@types\\//i"], ["y@1.0.0"]]);
  });

  it("keeps a stdout output as-is", () => {
    assert.equal(validateConfig({ output: "-" }, "cfg", base).output, "-");
  });

  it("reports every problem with its key", () => {
    assert.throws(
      () =>
        validateConfig(
          {
            inputs: "a",
            output: 5,
            lineEnding: "cr",
            omitVersions: "yes",
            replace: [],
            exclude: [1],
            failOn: ["nope"],
            allow: ["/(/"],
            oops: 1,
          },
          "cfg",
          base,
        ),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        for (const expected of [
          /unknown key "oops"/,
          /inputs: expected an array of strings/,
          /output: expected a string path/,
          /lineEnding: expected "lf" or "crlf"/,
          /omitVersions: expected a boolean/,
          /replace: expected an object/,
          /exclude: expected an array of strings/,
          /failOn: expected license categories/,
          /allow: invalid regular expression \/\(\//,
        ]) {
          assert.match(error.message, expected);
        }
        return true;
      },
    );
  });

  it("flags a non-string replacement file and a malformed exclude pattern", () => {
    assert.throws(
      () => validateConfig({ replace: { a: 1 }, exclude: ["/(/"] }, "cfg", base),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /replace\.a: expected a string path/);
        assert.match(error.message, /exclude: invalid regular expression/);
        return true;
      },
    );
  });

  it("suggests a close key for a typo, and nothing for unrelated keys", () => {
    assert.throws(() => validateConfig({ omitVerions: true }, "cfg", base), /did you mean "omitVersions"\?/);
    assert.throws(
      () => validateConfig({ zzzzzzzzzz: 1 }, "cfg", base),
      (error: unknown) => error instanceof CliError && !/did you mean/.test(error.message),
    );
  });

  it("rejects a config that isn't an object", () => {
    assert.throws(() => validateConfig([], "cfg", base), /Invalid config in cfg/);
  });
});
