import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupLicenses, licenseBreakdown } from "./group.js";

const pkg = (name: string, text: string, version = "1.0.0", notices: string[] = []) => ({
  name,
  version,
  text,
  notices,
});

describe("groupLicenses", () => {
  it("groups identical texts regardless of line endings and surrounding whitespace", () => {
    const groups = groupLicenses([pkg("b", "MIT\r\n"), pkg("a", "\nMIT"), pkg("c", "ISC")], false);
    assert.deepEqual(
      groups.map((group) => group.dependencies),
      [["c@1.0.0"], ["a@1.0.0", "b@1.0.0"]],
    );
  });

  it("omits versions and de-duplicates the resulting labels", () => {
    const groups = groupLicenses([pkg("a", "MIT", "1.0.0"), pkg("a", "MIT", "2.0.0")], true);
    assert.deepEqual(groups[0]?.dependencies, ["a"]);
  });

  it("keeps packages with different notices apart", () => {
    const groups = groupLicenses([pkg("a", "Apache", "1.0.0", ["N1"]), pkg("b", "Apache", "1.0.0", ["N2"])], false);
    assert.equal(groups.length, 2);
  });
});

describe("licenseBreakdown", () => {
  it("counts per declared license, most common first, with ties ordered by name", () => {
    const packages = [
      { license: "MIT" },
      { license: "ISC" },
      { license: "MIT" },
      { license: undefined },
      { license: "Apache-2.0" },
    ];
    assert.deepEqual(licenseBreakdown(packages), [
      ["MIT", 2],
      ["Apache-2.0", 1],
      ["ISC", 1],
      ["Unknown", 1],
    ]);
  });
});
