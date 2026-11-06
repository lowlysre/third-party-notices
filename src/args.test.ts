import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandVariadicInputs, helpText, parseCliArgs } from "./args.js";
import { UsageError } from "./errors.js";
import { createStyle } from "./ui/ansi.js";

describe("parseCliArgs", () => {
  it("parses flags and variadic inputs", () => {
    const args = parseCliArgs([
      "-i",
      "a/package.json",
      "b/package.json",
      "-o",
      "out.txt",
      "--ci",
      "--overwrite",
      "--eol",
      "crlf",
      "--omit-versions",
      "--no-spinner",
      "-q",
    ]);
    assert.deepEqual(args.inputs, ["a/package.json", "b/package.json"]);
    assert.equal(args.output, "out.txt");
    assert.equal(args.eol, "crlf");
    assert.ok(args.ci && args.overwrite && args.omitVersions && args.noSpinner && args.quiet);
  });

  it("defaults everything off", () => {
    const args = parseCliArgs([]);
    assert.deepEqual(args.inputs, []);
    assert.equal(args.ci, false);
    assert.equal(args.eol, undefined);
  });

  it("suggests the closest option for typos", () => {
    assert.throws(
      () => parseCliArgs(["--overwite"]),
      (error: unknown) =>
        error instanceof UsageError && error.hint === "did you mean --overwrite?" && error.exitCode === 2,
    );
  });

  it("rejects bad values", () => {
    assert.throws(() => parseCliArgs(["--eol", "cr"]), /Invalid --eol/);
    assert.throws(() => parseCliArgs(["-o"]), /requires a value/);
    assert.throws(() => parseCliArgs(["--ci=yes"]), /does not take a value/);
    assert.throws(() => parseCliArgs(["stray"]), /Unexpected argument/);
  });

  it("handles --version and --help", () => {
    assert.equal(parseCliArgs(["-v"]).version, true);
    assert.equal(parseCliArgs(["--help"]).help, true);
  });

  it("expands --fail-on categories from repeated and comma-separated values", () => {
    assert.deepEqual(parseCliArgs([]).failOn, []);
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
    assert.throws(
      () => parseCliArgs(["--fail-on", "nope"]),
      (error: unknown) => error instanceof UsageError && /copyleft, any/.test(error.hint ?? ""),
    );
  });
});

describe("expandVariadicInputs", () => {
  it("stops collecting at the next flag", () => {
    assert.deepEqual(expandVariadicInputs(["-i", "a", "b", "--ci", "c"]), [
      "--input",
      "a",
      "--input",
      "b",
      "--ci",
      "c",
    ]);
    assert.deepEqual(expandVariadicInputs(["--input"]), ["--input"]);
  });
});

describe("helpText", () => {
  it("documents every option", () => {
    const text = helpText(createStyle({ color: false }), 100);
    for (const flag of [
      "--input",
      "--output",
      "--config",
      "--overwrite",
      "--eol",
      "--ci",
      "--no-spinner",
      "--omit-versions",
      "--version",
      "--help",
    ]) {
      assert.ok(text.includes(flag), flag);
    }
    assert.ok(text.includes("tpn"));
  });
});
