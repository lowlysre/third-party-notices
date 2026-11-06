import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_CHOICES, expandCategories, reviewLicense, reviewPackages } from "./policy.js";

const category = (license: string | undefined) => reviewLicense(license)?.category;

describe("reviewLicense", () => {
  it("does not flag permissive licenses", () => {
    for (const license of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "0BSD", "Unlicense", "CC0-1.0", "Zlib"]) {
      assert.equal(reviewLicense(license), undefined, license);
    }
  });

  it("classifies copyleft by strength, keeping LGPL out of the GPL bucket", () => {
    for (const license of ["GPL-3.0-only", "GPL-2.0+", "GPL-3.0-or-later", "CC-BY-SA-4.0"]) {
      assert.equal(category(license), "strong-copyleft", license);
    }
    for (const license of ["AGPL-3.0-only", "SSPL-1.0"]) {
      assert.equal(category(license), "network-copyleft", license);
    }
    for (const license of [
      "LGPL-2.1",
      "MPL-2.0",
      "EPL-2.0",
      "CDDL-1.1",
      "EUPL-1.2",
      "CPL-1.0",
      "MS-RL",
      "CECILL-2.1",
    ]) {
      assert.equal(category(license), "weak-copyleft", license);
    }
  });

  it("flags restricted-use and source-available licenses", () => {
    for (const license of [
      "BUSL-1.1",
      "Elastic-2.0",
      "PolyForm-Noncommercial-1.0.0",
      "CC-BY-NC-SA-4.0",
      "CC-BY-ND-4.0",
      "JSON",
      "Commons-Clause",
    ]) {
      assert.equal(category(license), "restricted", license);
    }
  });

  it("flags unclear terms: placeholders, missing fields and text that isn't an SPDX expression", () => {
    for (const license of [
      "UNLICENSED",
      "NONE",
      "UNKNOWN",
      "LicenseRef-custom",
      "SEE LICENSE IN LICENSE.md",
      "Apache License, Version 2.0",
      "MIT AND",
      "(MIT",
      "OR MIT",
      "MIT WITH",
      "MIT WITH )",
      "GPL-3.0-only WITH AND",
    ]) {
      assert.equal(category(license), "unclear", license);
    }
    assert.deepEqual(reviewLicense(undefined), { category: "unclear", id: "(none)" });
    assert.deepEqual(reviewLicense("   "), { category: "unclear", id: "(none)" });
  });

  it("lets OR pick the mildest alternative and AND take the most severe", () => {
    assert.equal(reviewLicense("MIT OR GPL-3.0-only"), undefined);
    assert.equal(reviewLicense("MIT AND (BSD-3-Clause OR GPL-2.0-only)"), undefined);
    assert.equal(category("GPL-3.0-only OR LGPL-2.1"), "weak-copyleft");
    assert.equal(category("mit and gpl-3.0-only"), "strong-copyleft");
    assert.equal(category("GPL-3.0-only AND AGPL-3.0-only"), "network-copyleft");
    assert.equal(reviewLicense("MIT AND GPL-3.0-only")?.id, "GPL-3.0-only");
  });

  it("treats linking exceptions as weaker than plain GPL", () => {
    assert.equal(category("GPL-2.0-only WITH Classpath-exception-2.0"), "weak-copyleft");
    assert.equal(category("GPL-2.0-with-classpath-exception"), "weak-copyleft");
    assert.equal(category("AGPL-3.0-only WITH Some-exception"), "network-copyleft");
  });
});

describe("expandCategories", () => {
  it("expands names and groups, ignoring case and blanks", () => {
    assert.deepEqual(expandCategories(["Strong-Copyleft", " ", "restricted"]), ["strong-copyleft", "restricted"]);
    assert.deepEqual(expandCategories(["copyleft"]), ["weak-copyleft", "strong-copyleft", "network-copyleft"]);
    assert.equal(expandCategories(["any"])?.length, 5);
  });

  it("returns undefined for an unknown name", () => {
    assert.equal(expandCategories(["nope"]), undefined);
    assert.equal(expandCategories(["constructor"]), undefined);
    assert.ok(CATEGORY_CHOICES.includes("copyleft"));
  });
});

describe("reviewPackages", () => {
  const pkg = (name: string, license: string | undefined, version = "1.0.0") => ({
    name,
    version,
    license,
    dir: "",
    homepage: undefined,
    repository: undefined,
    author: undefined,
  });

  it("lists flagged packages most severe first and skips allowed ones", () => {
    const findings = reviewPackages(
      [
        pkg("fine", "MIT"),
        pkg("gpl", "GPL-3.0-only"),
        pkg("agpl", "AGPL-3.0-only"),
        pkg("none", undefined),
        pkg("ok-gpl", "GPL-3.0-only"),
      ],
      ["ok-gpl"],
    );
    assert.deepEqual(
      findings.map((finding) => `${finding.name}:${finding.category}`),
      ["none:unclear", "agpl:network-copyleft", "gpl:strong-copyleft"],
    );
  });

  it("allows by name@version and regular expression", () => {
    const packages = [
      pkg("a", "GPL-3.0-only", "1.0.0"),
      pkg("a", "GPL-3.0-only", "2.0.0"),
      pkg("@x/b", "GPL-3.0-only"),
    ];
    assert.deepEqual(
      reviewPackages(packages, ["a@1.0.0", "/^@x\\//"]).map((finding) => finding.version),
      ["2.0.0"],
    );
  });
});
