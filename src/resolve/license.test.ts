import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tempDir, writeFiles } from "../testing/fixtures.js";
import { isLicenseFileName, isNoticeFileName, readLicense } from "./license.js";
import { renderTemplate, SPDX_TEMPLATE_IDS, templateIdFor } from "./templates.js";

describe("license file names", () => {
  it("matches common spellings", () => {
    for (const name of [
      "LICENSE",
      "LICENCE",
      "license.md",
      "LICENSE.txt",
      "LICENSE-MIT",
      "COPYING",
      "COPYING.LESSER",
      "UNLICENSE",
    ]) {
      assert.equal(isLicenseFileName(name), true, name);
    }
  });

  it("rejects code and unrelated files", () => {
    for (const name of ["license.js", "license-checker.json", "licenser.txt", "README.md", "index.js"]) {
      assert.equal(isLicenseFileName(name), false, name);
    }
  });

  it("recognizes notice files", () => {
    assert.equal(isNoticeFileName("NOTICE"), true);
    assert.equal(isNoticeFileName("NOTICE.txt"), true);
    assert.equal(isNoticeFileName("notices.js"), false);
  });
});

describe("readLicense", () => {
  it("reads the license, appends distinct files and collects notices", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "LICENSE-MIT": "MIT text\r\n",
      "LICENSE.md": "MIT text",
      COPYING: "Other text",
      NOTICE: "Notice text",
      "package.json": "{}",
    });
    const info = await readLicense({ dir });
    assert.equal(info.text, "MIT text\n\nOther text");
    assert.deepEqual(info.notices, ["Notice text"]);
  });

  it("reads files from a licenses directory", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "licenses/a.txt": "A",
      "licenses/b.js": "ignored",
      "LICENSES/sub/skipped.txt": "nested",
      UNLICENSE: "Public domain",
      "NOTICES.md": "n",
    });
    const text = (await readLicense({ dir })).text;
    assert.ok(text?.includes("A"));
    assert.ok(text?.includes("Public domain"));
    assert.ok(!text?.includes("ignored"));
  });

  it("reports nothing when no license is shipped", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "index.js": "" });
    assert.deepEqual(await readLicense({ dir }), { text: undefined, notices: [] });
  });
});

describe("templates", () => {
  it("matches bundled SPDX ids exactly", () => {
    assert.equal(templateIdFor("MIT"), "MIT");
    assert.equal(templateIdFor("(isc)"), "ISC");
    assert.equal(templateIdFor("MIT OR Apache-2.0"), undefined);
    assert.equal(templateIdFor(undefined), undefined);
  });

  it("fills in the copyright holder", () => {
    assert.match(renderTemplate("MIT", "Ada Lovelace"), /Copyright \(c\) Ada Lovelace/);
    assert.match(renderTemplate("ISC", undefined), /the package authors/);
    for (const id of SPDX_TEMPLATE_IDS) {
      assert.match(renderTemplate(id, "X"), /Copyright \(c\) X/);
    }
  });

  it("throws for ids without a bundled template", () => {
    assert.throws(() => renderTemplate("GPL-3.0-only", "X"), /No bundled template/);
  });
});
