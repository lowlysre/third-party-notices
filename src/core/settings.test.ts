import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { emptyConfig } from "./schema.js";
import { type Overrides, resolveSettings } from "./settings.js";

const cwd = join("C:", "work");
const none: Overrides = {
  inputs: [],
  output: undefined,
  eol: undefined,
  omitVersions: false,
  overwrite: false,
  allowMissing: false,
  failOn: [],
};

describe("resolveSettings", () => {
  it("falls back to defaults", () => {
    const settings = resolveSettings(none, emptyConfig(), cwd, "lf");
    assert.deepEqual(settings.inputs, [join(cwd, "package.json")]);
    assert.equal(settings.output, join(cwd, "third-party-licenses.txt"));
    assert.equal(settings.lineEnding, "lf");
    assert.deepEqual([settings.omitVersions, settings.overwrite, settings.allowMissing], [false, false, false]);
    assert.equal(settings.blocked.size, 0);
  });

  it("uses the config over the defaults", () => {
    const config = {
      ...emptyConfig(),
      inputs: ["/a"],
      output: "/out.txt",
      lineEnding: "crlf" as const,
      omitVersions: true,
      overwrite: true,
      allowMissing: true,
    };
    const settings = resolveSettings(none, config, cwd, "lf");
    assert.deepEqual(settings.inputs, ["/a"]);
    assert.equal(settings.output, "/out.txt");
    assert.equal(settings.lineEnding, "crlf");
    assert.deepEqual([settings.omitVersions, settings.overwrite, settings.allowMissing], [true, true, true]);
  });

  it("lets the command line win, resolving its paths from the working directory", () => {
    const config = { ...emptyConfig(), inputs: ["/a"], output: "/out.txt", lineEnding: "crlf" as const };
    const args = { ...none, inputs: ["x/package.json"], output: "n.txt", eol: "lf" as const };
    const settings = resolveSettings(args, config, cwd, "crlf");
    assert.deepEqual(settings.inputs, [join(cwd, "x", "package.json")]);
    assert.equal(settings.output, join(cwd, "n.txt"));
    assert.equal(settings.lineEnding, "lf");
  });

  it("keeps stdout as-is and merges blocked categories from both sources", () => {
    const config = { ...emptyConfig(), failOn: ["restricted" as const] };
    const settings = resolveSettings({ ...none, output: "-", failOn: ["unclear"] }, config, cwd, "lf");
    assert.equal(settings.output, "-");
    assert.deepEqual([...settings.blocked].sort(), ["restricted", "unclear"]);
  });
});
