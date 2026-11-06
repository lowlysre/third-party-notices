import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseCliArgs } from "./args.js";
import { CliError } from "./errors.js";
import { run } from "./run.js";
import { installPackage, tempDir, writeFiles } from "./testing/fixtures.js";
import { capture, fakeIo, script } from "./testing/io.js";
import type { UiEnv } from "./ui/env.js";
import { ConsoleReporter } from "./ui/reporter.js";

const env: UiEnv = { color: false, unicode: true, animate: false, hero: false, hyperlinks: false, columns: 80 };
type Temp = Parameters<typeof tempDir>[0];

/** Runs the pipeline against `cwd`, optionally with an interactive prompt. */
function harness(cwd: string, interactive = false) {
  const stderr = capture();
  const stdout = capture();
  const tty = fakeIo();
  return {
    stderr: stderr.text,
    stdout: stdout.text,
    tty,
    exec: (argv: string[]) => {
      const args = parseCliArgs(argv);
      return run(args, {
        cwd,
        version: "1.2.3",
        reporter: new ConsoleReporter(stderr.out, env, { verbose: args.verbose }),
        stdout: stdout.out,
        prompt: interactive ? tty.io : undefined,
      });
    },
  };
}

/** A project whose only dependency has no license file. */
async function bareProject(t: Temp, license = "MIT"): Promise<string> {
  const root = await tempDir(t);
  await writeFiles(root, { "package.json": { name: "app", dependencies: { bare: "1" } } });
  await installPackage(root, "bare", { license });
  return root;
}

const config = (root: string, value: object) => writeFiles(root, { "third-party-notices.config.json": value });

describe("run: output", () => {
  it("writes grouped notices to a file and reports them", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1", b: "1" } } });
    await installPackage(root, "a", { license: "MIT", files: { LICENSE: "Shared text" } });
    await installPackage(root, "b", { license: "MIT", files: { LICENSE: "Shared text" } });
    const h = harness(root);
    await h.exec(["-o", "out.txt", "--eol", "lf"]);
    const text = await readFile(join(root, "out.txt"), "utf8");
    assert.match(text, /The following npm packages may be included in this product:\n\n - a@1\.0\.0\n - b@1\.0\.0/);
    assert.equal(text.match(/Shared text/g)?.length, 1);
    assert.match(h.stderr(), /Wrote out\.txt/);
    assert.match(h.stderr(), /MIT {2}█+ 2/);
  });

  it("writes only the document to stdout with -o -", async (t) => {
    const root = await bareProject(t);
    await config(root, { replace: { bare: "lic.txt" } });
    await writeFiles(root, { "lic.txt": "Std text" });
    const h = harness(root);
    await h.exec(["-o", "-", "--eol", "lf"]);
    assert.match(h.stdout(), /Std text/);
    assert.match(h.stderr(), /Wrote stdout/);
  });

  it("applies the config: exclude, replace, append, output and overwrite", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { bare: "1", skipme: "1" } } });
    await installPackage(root, "skipme", { files: { LICENSE: "Excluded text" } });
    await writeFiles(root, { "out.txt": "old", "lic.txt": "Replaced text", "extra.txt": "Appended text" });
    await config(root, {
      exclude: ["skipme"],
      replace: { "bare@1.0.0": "lic.txt" },
      append: ["extra.txt"],
      output: "out.txt",
      overwrite: true,
      lineEnding: "lf",
    });
    const h = harness(root);
    await h.exec([]);
    const text = await readFile(join(root, "out.txt"), "utf8");
    assert.match(text, /Replaced text/);
    assert.match(text, /Appended text/);
    assert.doesNotMatch(text, /Excluded text|skipme/);
    assert.match(h.stderr(), /1 packages, 1 excluded/);
  });

  it("fails clearly for unreadable replacement or appended files and missing dependencies", async (t) => {
    const root = await bareProject(t);
    await config(root, { replace: { bare: "missing.txt" } });
    await assert.rejects(harness(root).exec(["-o", "-"]), /Replacement license for bare not found/);
    await config(root, { exclude: ["bare"], append: ["missing.txt"] });
    await assert.rejects(harness(root).exec(["-o", "-"]), /Appended file not found/);

    const empty = await tempDir(t);
    await writeFiles(empty, { "package.json": { name: "app", dependencies: { gone: "1" } } });
    await assert.rejects(harness(empty).exec(["-o", "-"]), /not installed/);
  });
});

describe("run: existing output", () => {
  const setup = async (t: Temp) => {
    const root = await bareProject(t);
    await config(root, { replace: { bare: "lic.txt" } });
    await writeFiles(root, { "out.txt": "old", "lic.txt": "New text" });
    return root;
  };

  it("refuses to overwrite without a terminal, then overwrites with --overwrite", async (t) => {
    const root = await setup(t);
    await assert.rejects(
      harness(root).exec(["-o", "out.txt"]),
      (error: unknown) =>
        error instanceof CliError &&
        /out\.txt already exists/.test(error.message) &&
        /--overwrite/.test(error.hint ?? ""),
    );
    assert.equal(await readFile(join(root, "out.txt"), "utf8"), "old");
    await harness(root).exec(["-o", "out.txt", "--overwrite", "--eol", "lf"]);
    assert.match(await readFile(join(root, "out.txt"), "utf8"), /New text/);
  });

  it("asks first on a terminal, and leaves the file alone when declined", async (t) => {
    const root = await setup(t);
    const declined = harness(root, true);
    const pending = declined.exec(["-o", "out.txt"]);
    await script(declined.tty.input, declined.tty.output, [[/Overwrite\?/, "\u001b[B\r"]]);
    await assert.rejects(pending, /Aborted/);
    assert.equal(await readFile(join(root, "out.txt"), "utf8"), "old");

    const accepted = harness(root, true);
    const next = accepted.exec(["-o", "out.txt"]);
    await script(accepted.tty.input, accepted.tty.output, [[/Overwrite\?/, "\r"]]);
    await next;
    assert.match(await readFile(join(root, "out.txt"), "utf8"), /New text/);
  });
});

describe("run: packages with no license text", () => {
  it("fails with --ci, listing the packages", async (t) => {
    const root = await bareProject(t);
    await assert.rejects(harness(root, true).exec(["--ci", "-o", "-"]), /No license text found for 1 package/);
  });

  it("prompts on a terminal and uses the answer", async (t) => {
    const root = await bareProject(t, "Proprietary");
    const h = harness(root, true);
    const pending = h.exec(["-o", "-", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [
      [/How should this be handled\?/, "\u001b[B\r"],
      [/finish with a line containing only/, "Typed text\n.\n"],
    ]);
    await pending;
    assert.match(h.stdout(), /Typed text/);
  });

  it("skips a package declined at the prompt, with a warning and a verbose note", async (t) => {
    const root = await bareProject(t, "Proprietary");
    const h = harness(root, true);
    const pending = h.exec(["-o", "-", "--verbose"]);
    await script(h.tty.input, h.tty.output, [[/How should this be handled\?/, "\u001b"]]);
    await pending;
    assert.match(h.stderr(), /▲ Skipped bare@1\.0\.0: no license text/);
    assert.match(h.stderr(), /ℹ bare@1\.0\.0 declares Proprietary but ships no license file/);
    assert.doesNotMatch(h.stdout(), /bare@1\.0\.0\n/);
  });

  it("keeps the maintainer note out of the output without --verbose", async (t) => {
    const root = await bareProject(t, "Proprietary");
    const h = harness(root, true);
    const pending = h.exec(["-o", "-"]);
    await script(h.tty.input, h.tty.output, [[/How should this be handled\?/, "\u001b"]]);
    await pending;
    assert.doesNotMatch(h.stderr(), /ships no license file/);
  });
});

describe("run: --allow-missing", () => {
  async function mixedProject(t: Temp) {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { fine: "1", templated: "1", opaque: "1" } },
    });
    await installPackage(root, "fine", { license: "MIT", files: { LICENSE: "Shipped text" } });
    await installPackage(root, "templated", { license: "ISC", author: "Ada Lovelace" });
    await installPackage(root, "opaque", { license: "Proprietary" });
    return root;
  }

  it("uses a template where one fits and skips the rest, without prompting or failing", async (t) => {
    const h = harness(await mixedProject(t), true);
    await h.exec(["--ci", "--allow-missing", "-o", "-", "--eol", "lf", "--verbose"]);
    assert.match(h.stdout(), /Shipped text/);
    assert.match(h.stdout(), /ISC License\n\nCopyright \(c\) Ada Lovelace/);
    assert.doesNotMatch(h.stdout(), /opaque@/);
    assert.match(h.stderr(), /▲ templated@1\.0\.0: license text generated from an SPDX template, please review/);
    assert.match(h.stderr(), /▲ Skipped opaque@1\.0\.0: no license text/);
    assert.equal(h.tty.output(), "");
  });

  it("is also switched on by the config, even on a terminal", async (t) => {
    const root = await mixedProject(t);
    await config(root, { allowMissing: true });
    const h = harness(root, true);
    await h.exec(["-o", "-"]);
    assert.match(h.stderr(), /Skipped opaque@1\.0\.0/);
    assert.equal(h.tty.output(), "");
  });

  it("keeps NOTICE files found for a package whose license text is filled in", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { noted: "1" } } });
    await installPackage(root, "noted", { license: "ISC", files: { NOTICE: "Attribution required" } });
    const h = harness(root);
    await h.exec(["--allow-missing", "-o", "-", "--eol", "lf"]);
    assert.match(h.stdout(), /ISC License/);
    assert.match(h.stdout(), /Attribution required/);
  });
});

describe("run: license review", () => {
  async function reviewProject(t: Temp) {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { fine: "1", gpl: "1", agpl: "1", nolicense: "1" } },
    });
    await installPackage(root, "fine", { license: "MIT", files: { LICENSE: "MIT text" } });
    await installPackage(root, "gpl", { license: "GPL-3.0-only", files: { LICENSE: "GPL text" } });
    await installPackage(root, "agpl", { license: "AGPL-3.0-only", files: { LICENSE: "AGPL text" } });
    await installPackage(root, "nolicense", { files: { LICENSE: "Custom text" } });
    return root;
  }

  it("lists flagged packages most severe first without failing", async (t) => {
    const h = harness(await reviewProject(t));
    await h.exec(["--ci", "-o", "-"]);
    const out = h.stderr();
    assert.match(out, /▲ License review/);
    assert.ok(
      out.indexOf("nolicense@1.0.0") < out.indexOf("agpl@1.0.0") &&
        out.indexOf("agpl@1.0.0") < out.indexOf("gpl@1.0.0"),
    );
    assert.doesNotMatch(out, /fine@1\.0\.0/);
  });

  it("fails after writing when a blocked category is present", async (t) => {
    const root = await reviewProject(t);
    await assert.rejects(
      harness(root).exec(["--ci", "-o", "out.txt", "--fail-on", "strong-copyleft,network-copyleft"]),
      /2 packages in blocked license categories \(Network copyleft, Strong copyleft\)/,
    );
    assert.match(await readFile(join(root, "out.txt"), "utf8"), /GPL text/);
  });

  it("takes failOn and allow from the config", async (t) => {
    const root = await reviewProject(t);
    await config(root, { failOn: ["any"], allow: ["gpl", "/^agpl$/", "nolicense@1.0.0"] });
    const h = harness(root);
    await h.exec(["--ci", "-o", "-"]);
    assert.doesNotMatch(h.stderr(), /License review/);
    await config(root, { failOn: ["unclear"], allow: ["gpl"] });
    await assert.rejects(
      harness(root).exec(["--ci", "-o", "-"]),
      /1 package in blocked license categories \(Unclear terms\)/,
    );
  });
});
