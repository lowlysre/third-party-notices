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

describe("renderDocument", () => {
  const groups = groupLicenses(
    [
      pkg("one", "First license"),
      pkg("two", "Second", "2.0.0", ["Some notice"]),
      pkg("three", "Second", "2.0.0", ["Some notice"]),
    ],
    false,
  );
  const HEADER = [
    "This file was generated with the third-party-notices npm package!",
    "https://www.npmjs.com/package/third-party-notices",
  ];

  it("matches the generate-license-file layout", () => {
    const text = renderDocument({ groups, appended: ["Appended\nContent"], lineEnding: "lf" });
    assert.equal(
      text,
      [
        ...HEADER,
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
        ...HEADER,
        "",
      ].join("\n"),
    );
  });

  it("converts every line ending for crlf", () => {
    const text = renderDocument({ groups, appended: [], lineEnding: "crlf" });
    assert.ok(!/(?<!\r)\n/.test(text));
    assert.ok(text.includes("\r\n"));
  });
});
