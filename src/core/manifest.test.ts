import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorName, declaredLicense, describePackage, repositoryUrl } from "./manifest.js";

describe("declaredLicense", () => {
  it("reads strings, { type } objects and the legacy licenses array", () => {
    assert.equal(declaredLicense({ license: "MIT" }), "MIT");
    assert.equal(declaredLicense({ license: { type: "Apache-2.0" } }), "Apache-2.0");
    assert.equal(declaredLicense({ licenses: [{ type: "MIT" }, { type: "ISC" }, "BSD"] }), "MIT OR ISC OR BSD");
  });

  it("prefers license over the deprecated licenses array, which is a fallback", () => {
    assert.equal(declaredLicense({ license: "GPL-3.0-only", licenses: [{ type: "MIT" }] }), "GPL-3.0-only");
    assert.equal(declaredLicense({ licenses: [{ type: "MIT" }, { type: "ISC" }, "BSD"] }), "MIT OR ISC OR BSD");
  });

  it("falls back to license when the licenses array is empty, and to undefined when nothing is declared", () => {
    assert.equal(declaredLicense({ licenses: [], license: "MIT" }), "MIT");
    assert.equal(declaredLicense({ licenses: [] }), undefined);
    assert.equal(declaredLicense({}), undefined);
  });
});

describe("repositoryUrl", () => {
  it("normalizes npm repository forms to web URLs", () => {
    const expected = "https://github.com/acme/tool";
    for (const value of [
      "git+https://github.com/acme/tool.git",
      "git://github.com/acme/tool.git",
      "https://github.com/acme/tool",
      "git@github.com:acme/tool.git",
      "ssh://git@github.com/acme/tool.git",
      "github:acme/tool",
      "acme/tool",
      { type: "git", url: "git+https://github.com/acme/tool.git#main" },
    ]) {
      assert.equal(repositoryUrl(value), expected, JSON.stringify(value));
    }
    assert.equal(repositoryUrl("gitlab:acme/tool"), "https://gitlab.com/acme/tool");
    assert.equal(repositoryUrl("bitbucket:acme/tool"), "https://bitbucket.org/acme/tool");
  });

  it("returns undefined for unusable values", () => {
    for (const value of [undefined, null, 42, "", "  ", {}, { url: 5 }, "not a url", "file:../local"]) {
      assert.equal(repositoryUrl(value), undefined, JSON.stringify(value));
    }
  });
});

describe("authorName", () => {
  it("strips the email and url from a string and reads { name }", () => {
    assert.equal(authorName("Ada <ada@x.y> (https://x.y)"), "Ada");
    assert.equal(authorName({ name: "Bob" }), "Bob");
  });

  it("returns undefined for anything else", () => {
    for (const value of [undefined, null, 42, "", "<only@email>", {}]) {
      assert.equal(authorName(value), undefined, JSON.stringify(value));
    }
  });
});

describe("describePackage", () => {
  it("fills in the name and version when the manifest omits them", () => {
    const pkg = describePackage({ homepage: "https://x.example" }, "/dir", "fallback");
    assert.deepEqual(
      [pkg.name, pkg.version, pkg.dir, pkg.homepage],
      ["fallback", "0.0.0", "/dir", "https://x.example"],
    );
  });

  it("drops control characters from metadata so it can't inject terminal sequences", () => {
    const pkg = describePackage(
      { name: "evil\u001b]52;c;eA==\u0007pkg", license: "MIT\u001b[2J", author: "Ada\u0000" },
      "/dir",
      "x",
    );
    assert.deepEqual([pkg.name, pkg.license, pkg.author], ["evil]52;c;eA==pkg", "MIT[2J", "Ada"]);
  });
});
