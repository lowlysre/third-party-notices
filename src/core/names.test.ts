import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLicenseFileName, isLicensesDirFile, isNoticeFileName, licenseRank } from "./names.js";

describe("isLicenseFileName", () => {
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
      "LICENSE.tar.gz",
      "licenser.txt",
      "sublicense.txt",
      "unlicensed.txt",
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

  it("ranks the best match lowest", () => {
    const ranks = ["LICENSE", "LICENSE.md", "COPYING", "MIT-LICENSE", "OFL", "COPYRIGHT", "PATENTS"].map(licenseRank);
    assert.deepEqual(
      ranks,
      [...ranks].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
    assert.equal(licenseRank("README.md"), undefined);
  });
});

describe("isLicensesDirFile", () => {
  it("accepts REUSE files named by SPDX id as well as root-style names", () => {
    for (const name of ["Apache-2.0.txt", "LicenseRef-custom.md", "MIT.html", "LICENSE"]) {
      assert.equal(isLicensesDirFile(name), true, name);
    }
    for (const name of ["notes.js", "data.bin", "image.png"]) {
      assert.equal(isLicensesDirFile(name), false, name);
    }
  });
});

describe("isNoticeFileName", () => {
  it("recognizes NOTICE files but not code", () => {
    assert.equal(isNoticeFileName("NOTICE"), true);
    assert.equal(isNoticeFileName("NOTICE.txt"), true);
    assert.equal(isNoticeFileName("notices.js"), false);
  });
});
