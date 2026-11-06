import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ResolvedPackage } from "../core/types.js";
import { CliError } from "../errors.js";
import { tempDir, writeFiles } from "../testing/fixtures.js";
import { licenseFor, readLicense } from "./license.js";

describe("readLicense", () => {
  it("reads the best match first, merges duplicates, and collects NOTICE files", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "LICENSE-MIT": "MIT text\r\n",
      "LICENSE.md": "MIT text",
      COPYING: "Other text",
      NOTICE: "Notice text",
      "package.json": "{}",
    });
    assert.deepEqual(await readLicense(dir), { text: "MIT text\n\nOther text", notices: ["Notice text"] });
  });

  it("reads REUSE files from a LICENSES directory by SPDX id", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, {
      "LICENSES/Apache-2.0.txt": "apache",
      "LICENSES/LicenseRef-custom.md": "custom",
      "LICENSES/notes.js": "ignored",
      "LICENSES/data.bin": "ignored",
      "LICENSES/sub/skipped.txt": "nested",
    });
    assert.equal((await readLicense(dir)).text, "apache\n\ncustom");
  });

  it("orders matches by Licensee's score", async (t) => {
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
      (await readLicense(dir)).text,
      "license\n\nlicense-md\n\ncopying\n\nmit-license\n\nofl\n\ncopyright\n\npatents",
    );
  });

  it("merges the same text saved with different line endings", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { LICENSE: "line one\nline two\n", COPYING: "line one\r\nline two\r\n" });
    assert.equal((await readLicense(dir)).text, "line one\nline two");
  });

  it("reports nothing when no license is shipped", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "index.js": "", "license.js": "code" });
    assert.deepEqual(await readLicense(dir), { text: undefined, notices: [] });
  });
});

describe("licenseFor", () => {
  const pkg = (dir: string): ResolvedPackage => ({
    name: "p",
    version: "1.2.3",
    dir,
    license: undefined,
    homepage: undefined,
    repository: undefined,
    author: undefined,
  });

  it("prefers a replacement by name@version, then by name, over the package's own files", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { LICENSE: "own", "exact.txt": "by version", "loose.txt": "by name" });
    const exact = join(dir, "exact.txt");
    const loose = join(dir, "loose.txt");
    assert.equal((await licenseFor(pkg(dir), { "p@1.2.3": exact, p: loose })).text, "by version");
    assert.equal((await licenseFor(pkg(dir), { p: loose })).text, "by name");
    assert.equal((await licenseFor(pkg(dir), {})).text, "own");
  });

  it("keeps the package's NOTICE files when a replacement supplies the text", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { LICENSE: "own", NOTICE: "notice", "other.txt": "replacement" });
    const info = await licenseFor(pkg(dir), { p: join(dir, "other.txt") });
    assert.deepEqual(info, { text: "replacement", notices: ["notice"] });
  });

  it("ignores inherited object properties when looking up replacements", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { LICENSE: "own" });
    assert.equal((await licenseFor({ ...pkg(dir), name: "constructor" }, {})).text, "own");
  });

  it("treats a blank replacement file as missing text", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "blank.txt": "  \n" });
    assert.equal((await licenseFor(pkg(dir), { p: join(dir, "blank.txt") })).text, undefined);
  });

  it("fails when the replacement file is missing", async (t) => {
    const dir = await tempDir(t);
    await assert.rejects(
      licenseFor(pkg(dir), { p: join(dir, "missing.txt") }),
      (error: unknown) => error instanceof CliError && /Replacement license for p not found/.test(error.message),
    );
  });
});
