import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORY_CHOICES, expandCategories, reviewLicense } from "./policy.js";

const category = (license: string | undefined): string | undefined => reviewLicense(license)?.category;

describe("reviewLicense", () => {
  it("does not flag permissive licenses", () => {
    for (const license of [
      "MIT",
      "ISC",
      "Apache-2.0",
      "BSD-3-Clause",
      "0BSD",
      "Unlicense",
      "CC0-1.0",
      "BlueOak-1.0.0",
      "Zlib",
    ]) {
      assert.equal(reviewLicense(license), undefined, license);
    }
  });

  it("flags strong and network copyleft", () => {
    assert.equal(category("GPL-3.0-only"), "strong-copyleft");
    assert.equal(category("GPL-2.0+"), "strong-copyleft");
    assert.equal(category("GPL-3.0-or-later"), "strong-copyleft");
    assert.equal(category("CC-BY-SA-4.0"), "strong-copyleft");
    assert.equal(category("AGPL-3.0-only"), "network-copyleft");
    assert.equal(category("SSPL-1.0"), "network-copyleft");
  });

  it("flags weak copyleft and keeps LGPL out of the GPL bucket", () => {
    for (const license of [
      "LGPL-2.1",
      "LGPL-3.0-or-later",
      "MPL-2.0",
      "EPL-1.0",
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
      "CC-BY-NC-4.0",
      "CC-BY-NC-SA-4.0",
      "CC-BY-ND-4.0",
      "JSON",
      "Commons-Clause",
    ]) {
      assert.equal(category(license), "restricted", license);
    }
  });

  it("flags unclear terms", () => {
    for (const license of [
      "UNLICENSED",
      "NONE",
      "UNKNOWN",
      "LicenseRef-custom",
      "SEE LICENSE IN LICENSE.md",
      "see license in file",
      "Apache License, Version 2.0",
      "MIT AND",
      "(MIT",
      "OR MIT",
    ]) {
      assert.equal(category(license), "unclear", license);
    }
    assert.deepEqual(reviewLicense(undefined), { category: "unclear", id: "(none)" });
    assert.deepEqual(reviewLicense("   "), { category: "unclear", id: "(none)" });
  });

  it("lets OR pick the mildest alternative and AND take the most severe", () => {
    assert.equal(reviewLicense("MIT OR GPL-3.0-only"), undefined);
    assert.equal(reviewLicense("(MIT OR Apache-2.0)"), undefined);
    assert.equal(category("GPL-3.0-only OR LGPL-2.1"), "weak-copyleft");
    assert.equal(category("MIT AND GPL-3.0-only"), "strong-copyleft");
    assert.equal(category("GPL-3.0-only AND AGPL-3.0-only"), "network-copyleft");
    assert.equal(category("MIT AND (BSD-3-Clause OR GPL-2.0-only)"), undefined);
    assert.equal(category("mit and gpl-3.0-only"), "strong-copyleft");
    assert.equal(reviewLicense("GPL-3.0-only OR AGPL-3.0-only")?.id, "GPL-3.0-only");
  });

  it("treats linking exceptions as weaker than plain GPL", () => {
    assert.equal(category("GPL-2.0-only WITH Classpath-exception-2.0"), "weak-copyleft");
    assert.equal(category("GPL-2.0-with-classpath-exception"), "weak-copyleft");
    assert.equal(category("AGPL-3.0-only WITH Some-exception"), "network-copyleft");
    assert.equal(category("MIT WITH"), "unclear");
  });

  it("reports the id that triggered the category", () => {
    assert.equal(reviewLicense("MIT AND GPL-3.0-only")?.id, "GPL-3.0-only");
  });
});

describe("expandCategories", () => {
  it("expands names and groups, ignoring case and blanks", () => {
    assert.deepEqual(expandCategories(["Strong-Copyleft", " ", "restricted"]), ["strong-copyleft", "restricted"]);
    assert.deepEqual(expandCategories(["copyleft"]), ["weak-copyleft", "strong-copyleft", "network-copyleft"]);
    assert.equal(expandCategories(["any"])?.length, 5);
    assert.deepEqual(expandCategories([]), []);
  });

  it("returns undefined for unknown names", () => {
    assert.equal(expandCategories(["nope"]), undefined);
    assert.ok(CATEGORY_CHOICES.includes("copyleft"));
  });
});
