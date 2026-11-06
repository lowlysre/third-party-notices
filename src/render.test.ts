import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupLicenses } from "./group.js";
import { renderDocument } from "./render.js";

const pkg = (name: string, text: string, version = "1.0.0", notices: string[] = []) => ({
  name,
  version,
  text,
  notices,
});

describe("groupLicenses", () => {
  it("groups identical texts regardless of EOL and surrounding whitespace", () => {
    const groups = groupLicenses([pkg("b", "MIT\r\n"), pkg("a", "\nMIT"), pkg("c", "ISC")], false);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0]?.dependencies, ["c@1.0.0"]);
    assert.deepEqual(groups[1]?.dependencies, ["a@1.0.0", "b@1.0.0"]);
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

describe("renderDocument", () => {
  const groups = groupLicenses(
    [
      pkg("one", "First license"),
      pkg("two", "Second", "2.0.0", ["Some notice"]),
      pkg("three", "Second", "2.0.0", ["Some notice"]),
    ],
    false,
  );

  it("matches the generate-license-file layout", () => {
    const text = renderDocument({ groups, appended: ["Appended\nContent"], lineEnding: "lf" });
    assert.equal(
      text,
      [
        "This file was generated with the third-party-notices npm package!",
        "https://www.npmjs.com/package/third-party-notices",
        "",
        "The following npm package may be included in this product:",
        "",
        " - one@1.0.0",
        "",
        "This package contains the following license:",
        "",
        "First license",
        "",
        "-----------",
        "",
        "The following npm packages may be included in this product:",
        "",
        " - three@2.0.0",
        " - two@2.0.0",
        "",
        "These packages each contain the following license:",
        "",
        "Second",
        "",
        "With the following notices:",
        "",
        "Some notice",
        "",
        "-----------",
        "",
        "Appended",
        "Content",
        "",
        "-----------",
        "",
        "This file was generated with the third-party-notices npm package!",
        "https://www.npmjs.com/package/third-party-notices",
        "",
      ].join("\n"),
    );
  });

  it("converts line endings", () => {
    const text = renderDocument({ groups, appended: [], lineEnding: "crlf" });
    assert.ok(text.includes("\r\n"));
    assert.ok(!/(?<!\r)\n/.test(text));
  });
});
