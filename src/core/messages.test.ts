import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingDependenciesError, missingFileNote, policyError, unresolvedError } from "./messages.js";
import type { Finding } from "./policy.js";
import type { ResolvedPackage } from "./types.js";

const pkg = (name: string, extra: Partial<ResolvedPackage> = {}): ResolvedPackage => ({
  name,
  version: "1.0.0",
  dir: "",
  license: undefined,
  homepage: undefined,
  repository: undefined,
  author: undefined,
  ...extra,
});

const finding = (name: string): Finding => ({
  name,
  version: "1.0.0",
  category: "strong-copyleft",
  id: "GPL-3.0-only",
});

describe("unresolvedError", () => {
  it("lists packages with their declared license and a hint", () => {
    const error = unresolvedError([pkg("a", { license: "MIT" }), pkg("b")]);
    assert.match(
      error.message,
      /^No license text found for 2 packages:\n {2}- a@1\.0\.0 \(declares MIT\)\n {2}- b@1\.0\.0$/,
    );
    assert.match(error.hint ?? "", /--allow-missing/);
  });

  it("uses the singular for one package and truncates long lists", () => {
    assert.match(unresolvedError([pkg("a")]).message, /for 1 package:/);
    const many = unresolvedError(Array.from({ length: 12 }, (_, i) => pkg(`p${i}`)));
    assert.match(many.message, /12 packages/);
    assert.match(many.message, /…and 2 more/);
  });
});

describe("policyError", () => {
  it("names the categories and truncates after five packages", () => {
    const error = policyError(Array.from({ length: 7 }, (_, i) => finding(`gpl${i}`)));
    assert.match(error.message, /^7 packages in blocked license categories \(Strong copyleft\):/);
    assert.match(error.message, /gpl0@1\.0\.0 \(GPL-3\.0-only\)/);
    assert.match(error.message, /…and 2 more/);
    assert.match(error.hint ?? "", /"allow"/);
  });

  it("uses the singular for one package", () => {
    assert.match(policyError([finding("a")]).message, /^1 package in blocked/);
  });
});

describe("missingDependenciesError", () => {
  it("handles one or several missing dependencies", () => {
    assert.match(missingDependenciesError(["a (required by app)"]).message, /^1 dependency is not installed/);
    const many = missingDependenciesError(Array.from({ length: 10 }, (_, i) => `d${i}`));
    assert.match(many.message, /^10 dependencies are not installed/);
    assert.match(many.message, /…and 2 more/);
  });
});

describe("missingFileNote", () => {
  it("says what the package declares and where to reach the maintainers", () => {
    assert.equal(
      missingFileNote(pkg("a", { license: "MIT", homepage: "https://a.example" })),
      "declares MIT but ships no license file; consider asking the maintainers to add one (https://a.example)",
    );
    assert.equal(
      missingFileNote(pkg("a", { repository: "https://github.com/x/a" })),
      "declares no license and ships no license file; consider asking the maintainers to add one (https://github.com/x/a)",
    );
    assert.doesNotMatch(missingFileNote(pkg("a", { license: "MIT" })), /\(http/);
  });
});
