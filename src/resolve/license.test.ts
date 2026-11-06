import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tempDir, writeFiles } from "../testing/fixtures.js";
import { isLicenseFileName, isNoticeFileName, readLicense } from "./license.js";
import { renderTemplate, SPDX_TEMPLATE_IDS, templateIdFor } from "./templates.js";

describe("license file names", () => {
  it("matches the conventions GitHub recognizes", () => {
    for (const name of [
      "LICENSE",
      "LICENCE",
      "UNLICENSE",
      "license.md",
      "LICENSE.markdown",
      "LICENSE.txt",
      "LICENSE.html",
      "LICENSE.rst",
      "LICENSE.docs",
      "LICENSE-MIT",
      "LICENSE_APACHE.txt",
      "LICENSE-2.0.txt",
      "MIT-LICENSE",
      "MIT-LICENSE.txt",
      "apache_license.md",
      "COPYING",
      "COPYING.txt",
      "COPYING.LESSER",
      "COPYING-GPL",
      "GPL-COPYING",
      "COPYRIGHT",
      "COPYRIGHT.txt",
      "COPYRIGHT-HOLDERS.md",
      "OFL",
      "OFL.txt",
      "PATENTS",
      "PATENTS.md",
    ]) {
      assert.equal(isLicenseFileName(name), true, name);
    }
  });

  it("rejects code, data, binaries and look-alikes", () => {
    for (const name of [
      "license.js",
      "license.ts",
      "license.json",
      "license-checker.json",
      "license.xml",
      "license.sh",
      "license.go",
      "LICENSE.spdx",
      "LICENSE.png",
      "licenser.txt",
      "sublicense.txt",
      "unlicensed.txt",
      "LICENSE.tar.gz",
      "BSD-3-LICENSE",
      "GPL-COPYRIGHT",
      "OFL-FAQ.txt",
      "patents-list.txt",
      "README.md",
      "index.js",
    ]) {
      assert.equal(isLicenseFileName(name), false, name);
    }
  });

  it("orders matches by GitHub's licensee score", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      PATENTS: "patents",
      COPYRIGHT: "copyright",
      OFL: "ofl",
      "MIT-LICENSE": "mit-license",
      COPYING: "copying",
      "LICENSE.md": "license-md",
      LICENSE: "license",
    });
    assert.equal(
      (await readLicense({ dir })).text,
      "license\n\nlicense-md\n\ncopying\n\nmit-license\n\nofl\n\ncopyright\n\npatents",
    );
  });

  it("reads REUSE files from a LICENSES directory by SPDX id", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "LICENSES/Apache-2.0.txt": "apache",
      "LICENSES/LicenseRef-custom.md": "custom",
      "LICENSES/notes.js": "ignored",
      "LICENSES/data.bin": "bin",
    });
    assert.equal((await readLicense({ dir })).text, "apache\n\ncustom");
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
