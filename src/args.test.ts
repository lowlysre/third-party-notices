import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandVariadicInputs, OPTIONS, parseCliArgs } from "./args.js";
import { UsageError } from "./errors.js";

describe("parseCliArgs", () => {
  it("parses flags and variadic inputs", () => {
    const args = parseCliArgs([
      "-i",
      "a/package.json",
      "b/package.json",
      "-o",
      "out.txt",
      "-c",
      "cfg.json",
      "--ci",
      "--overwrite",
      "--allow-missing",
      "--eol",
      "crlf",
      "--omit-versions",
      "--no-spinner",
      "--no-color",
      "-q",
      "--verbose",
    ]);
    assert.deepEqual(args.inputs, ["a/package.json", "b/package.json"]);
    assert.deepEqual([args.output, args.config, args.eol], ["out.txt", "cfg.json", "crlf"]);
    assert.ok(args.ci && args.overwrite && args.allowMissing && args.omitVersions);
    assert.ok(args.noSpinner && args.noColor && args.quiet && args.verbose);
  });

  it("defaults everything off", () => {
    const args = parseCliArgs([]);
    assert.deepEqual([args.inputs, args.failOn, args.eol, args.output], [[], [], undefined, undefined]);
    assert.ok(!args.ci && !args.help && !args.version && !args.verbose && !args.allowMissing);
  });

  it("handles -v and -h", () => {
    assert.equal(parseCliArgs(["-v"]).version, true);
    assert.equal(parseCliArgs(["--help"]).help, true);
  });

  it("expands --fail-on categories from repeated and comma-separated values", () => {
    assert.deepEqual(parseCliArgs(["--fail-on", "strong-copyleft,restricted"]).failOn, [
      "strong-copyleft",
      "restricted",
    ]);
    assert.deepEqual(parseCliArgs(["--fail-on", "copyleft", "--fail-on", "unclear"]).failOn, [
      "weak-copyleft",
      "strong-copyleft",
      "network-copyleft",
      "unclear",
    ]);
  });

  it("suggests the closest option for a typo, with exit code 2", () => {
    assert.throws(
      () => parseCliArgs(["--overwite"]),
      (error: unknown) =>
        error instanceof UsageError && error.hint === "did you mean --overwrite?" && error.exitCode === 2,
    );
    assert.throws(() => parseCliArgs(["--zzzzzzzzzzzz"]), /Unknown option/);
  });

  it("rejects bad values and stray arguments", () => {
    assert.throws(() => parseCliArgs(["--eol", "cr"]), /Invalid --eol/);
    assert.throws(() => parseCliArgs(["-o"]), /requires a value/);
    assert.throws(() => parseCliArgs(["-o", "--ci"]), /--output requires a value/);
    assert.throws(() => parseCliArgs(["--input", "--ci"]), /--input requires a value/);
    assert.equal(parseCliArgs(["-o", "-"]).output, "-");
    assert.equal(parseCliArgs(["--output=--ci"]).output, "--ci");
    assert.throws(() => parseCliArgs(["--ci=yes"]), /does not take a value/);
    assert.throws(() => parseCliArgs(["--fail-on", "copyleft", "--fail-on"]), UsageError);
    assert.throws(() => parseCliArgs(["--input", "a", "--input"]), UsageError);
    assert.throws(() => parseCliArgs(["stray"]), /Unexpected argument/);
    assert.throws(
      () => parseCliArgs(["--fail-on", "nope"]),
      (error: unknown) => error instanceof UsageError && /copyleft, any/.test(error.hint ?? ""),
    );
  });

  it("declares every option exactly once, with a description", () => {
    const names = OPTIONS.map((option) => option.name);
    assert.equal(new Set(names).size, names.length);
    assert.ok(OPTIONS.every((option) => option.description.length > 0));
  });
});

describe("expandVariadicInputs", () => {
  it("repeats --input per path and stops at the next flag", () => {
    assert.deepEqual(expandVariadicInputs(["-i", "a", "b", "--ci", "c"]), [
      "--input",
      "a",
      "--input",
      "b",
      "--ci",
      "c",
    ]);
  });

  it("leaves a bare input flag for the parser to reject", () => {
    assert.deepEqual(expandVariadicInputs(["--input"]), ["--input"]);
    assert.deepEqual(expandVariadicInputs(["-i", "--ci"]), ["--input", "--ci"]);
  });
});
