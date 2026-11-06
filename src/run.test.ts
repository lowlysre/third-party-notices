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

function harness(cwd: string, withPrompt = false) {
  const stderr = capture();
  const stdout = capture();
  const tty = fakeIo();
  const reporter = new ConsoleReporter(stderr.out, env);
  return {
    stderr: stderr.text,
    stdout: stdout.text,
    tty,
    exec: (argv: string[]) =>
      run(parseCliArgs(argv), {
        cwd,
        version: "1.2.3",
        reporter,
        stdout: stdout.out,
        prompt: withPrompt ? tty.io : undefined,
      }),
  };
}

/** Project whose only dependency ships no license text. */
async function bareProject(t: Parameters<typeof tempDir>[0], license = "MIT"): Promise<string> {
  const root = await tempDir(t);
  await writeFiles(root, { "package.json": { name: "app", dependencies: { bare: "1" } } });
  await installPackage(root, "bare", { license, files: {} });
  return root;
}

describe("run: output handling", () => {
  it("asks before overwriting and aborts when declined", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, { "out.txt": "keep", "bare-license.txt": "Text" });
    await writeFiles(root, { "third-party-notices.config.json": { replace: { bare: "./bare-license.txt" } } });
    const h = harness(root, true);
    const pending = h.exec(["-o", "out.txt", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [[/already exists\. Overwrite\?/, "\u001b[B\r"]]);
    await assert.rejects(pending, (error: unknown) => error instanceof CliError && /Aborted/.test(error.message));
    assert.equal(await readFile(join(root, "out.txt"), "utf8"), "keep");
  });

  it("overwrites after confirmation", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, { "out.txt": "old", "bare-license.txt": "Replacement text" });
    await writeFiles(root, { "third-party-notices.config.json": { replace: { bare: "./bare-license.txt" } } });
    const h = harness(root, true);
    const pending = h.exec(["-o", "out.txt", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [[/Overwrite\?/, "\r"]]);
    await pending;
    assert.match(await readFile(join(root, "out.txt"), "utf8"), /Replacement text/);
  });

  it("honors overwrite and output from the config", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, {
      "out.txt": "old",
      "lic.txt": "Config text",
      "third-party-notices.config.json": {
        output: "out.txt",
        overwrite: true,
        replace: { "bare@1.0.0": "lic.txt" },
        lineEnding: "lf",
      },
    });
    const h = harness(root);
    await h.exec([]);
    assert.match(await readFile(join(root, "out.txt"), "utf8"), /Config text/);
  });

  it("writes to stdout with -o -", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, {
      "lic.txt": "Std text",
      "third-party-notices.config.json": { replace: { bare: "lic.txt" } },
    });
    const h = harness(root);
    await h.exec(["-o", "-", "--eol", "lf"]);
    assert.match(h.stdout(), /Std text/);
    assert.match(h.stderr(), /Wrote stdout/);
  });

  it("reports excluded packages and unreadable replacement or appendix files", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, { "third-party-notices.config.json": { exclude: ["bare"] } });
    const excluded = harness(root);
    await excluded.exec(["-o", "-"]);
    assert.match(excluded.stderr(), /0 packages, 1 excluded/);

    await writeFiles(root, { "third-party-notices.config.json": { replace: { bare: "missing.txt" } } });
    await assert.rejects(harness(root).exec(["-o", "-"]), /Replacement license for bare not found/);

    await writeFiles(root, { "third-party-notices.config.json": { exclude: ["bare"], append: ["missing.txt"] } });
    await assert.rejects(harness(root).exec(["-o", "-"]), /Appended file not found/);
  });

  it("surfaces dependency resolution failures", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { gone: "1" } } });
    await assert.rejects(harness(root).exec(["-o", "-"]), /not installed/);
  });

  it("truncates long lists of unresolved packages", async (t) => {
    const root = await tempDir(t);
    const deps = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`pkg${i}`, "1"]));
    await writeFiles(root, { "package.json": { name: "app", dependencies: deps } });
    for (const name of Object.keys(deps)) {
      await installPackage(root, name);
    }
    await assert.rejects(harness(root).exec(["--ci", "-o", "-"]), (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.match(error.message, /No license text found for 12 packages/);
      assert.match(error.message, /and 2 more/);
      return true;
    });
  });

  it("singular wording for one unresolved package", async (t) => {
    const root = await bareProject(t);
    await assert.rejects(harness(root).exec(["--ci", "-o", "-"]), /for 1 package:/);
  });
});

describe("run: interactive license prompts", () => {
  const HOW = /How should this be handled\?/;

  it("generates text from an SPDX template and flags it for review", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, {
      "node_modules/bare/package.json": {
        name: "bare",
        version: "1.0.0",
        license: "MIT",
        author: "Ada Lovelace <ada@example.com>",
        homepage: "https://example.com",
      },
    });
    const h = harness(root, true);
    const pending = h.exec(["-o", "-", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [[HOW, "\u001b[B\u001b[B\r"]]);
    await pending;
    assert.match(h.stdout(), /Copyright \(c\) Ada Lovelace/);
    assert.match(h.stderr(), /generated from an SPDX template/);
    assert.match(h.tty.output(), /declares MIT/);
  });

  it("skips a package with Escape and warns", async (t) => {
    const root = await bareProject(t, "Proprietary");
    const h = harness(root, true);
    const pending = h.exec(["-o", "-", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [[HOW, "\u001b"]]);
    await pending;
    assert.match(h.stderr(), /Skipped bare@1\.0\.0: no license text/);
    assert.match(h.tty.output(), /declares Proprietary/);
    assert.doesNotMatch(h.stdout(), /bare@1\.0\.0\n/);
  });

  it("accepts pasted text and retries after an empty paste", async (t) => {
    const root = await bareProject(t);
    const h = harness(root, true);
    const pending = h.exec(["-o", "-", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [
      [HOW, "\u001b[B\r"],
      [/finish with a line containing only/, ".\n"],
      [/Nothing was entered/, ""],
      [HOW, "\u001b[B\r"],
      [/finish with a line containing only/, "Pasted line one\nPasted line two\n.\n"],
    ]);
    await pending;
    assert.match(h.stdout(), /Pasted line one\nPasted line two/);
  });

  it("reads a license file, retrying after unreadable and empty files", async (t) => {
    const root = await bareProject(t, "Custom");
    await writeFiles(root, { "empty.txt": "  \n", "real.txt": "From a file" });
    const h = harness(root, true);
    const pending = h.exec(["-o", "-", "--eol", "lf"]);
    await script(h.tty.input, h.tty.output, [
      [HOW, "\r"],
      [/Path to license file:/, `${join(root, "missing.txt")}\n`],
      [/Could not read/, ""],
      [HOW, "\r"],
      [/Path to license file:/, `${join(root, "empty.txt")}\n`],
      [/That file is empty/, ""],
      [HOW, "\r"],
      [/Path to license file:/, `${join(root, "real.txt")}\n`],
    ]);
    await pending;
    assert.match(h.stdout(), /From a file/);
  });

  it("does not prompt when --ci is set even with a terminal", async (t) => {
    const root = await bareProject(t);
    await assert.rejects(harness(root, true).exec(["--ci", "-o", "-"]), /No license text found/);
  });
});
