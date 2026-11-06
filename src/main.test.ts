import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { type Io, main, readVersion } from "./main.js";
import { installPackage, tempDir, writeFiles } from "./testing/fixtures.js";
import { capture, fakeTtyInput, script } from "./testing/io.js";

type Tty = ReturnType<typeof fakeTtyInput>["input"];

function makeIo(cwd: string, options: { tty?: boolean; env?: Record<string, string> } = {}) {
  const stdout = capture();
  const stderr = capture();
  const { input } = fakeTtyInput();
  input.isTTY = options.tty === true;
  const io: Io = {
    stdout: Object.assign(stdout.out, { isTTY: options.tty === true, columns: 100 }),
    stderr: Object.assign(stderr.out, { isTTY: options.tty === true, columns: 100 }),
    stdin: input as unknown as Io["stdin"],
    env: { LANG: "en_US.UTF-8", WT_SESSION: "test", ...options.env },
    cwd,
  };
  return { io, stdout: stdout.text, stderr: stderr.text, input: input as Tty };
}

async function bareProject(t: Parameters<typeof tempDir>[0]): Promise<string> {
  const root = await tempDir(t);
  await writeFiles(root, { "package.json": { name: "app", dependencies: { bare: "1" } } });
  await installPackage(root, "bare", { license: "MIT" });
  return root;
}

describe("main", () => {
  it("prints the version from package.json", async (t) => {
    const h = makeIo(await tempDir(t));
    assert.equal(await main(["--version"], h.io), 0);
    assert.equal(h.stdout(), `${readVersion()}\n`);
  });

  it("prints help with the hero on an interactive terminal", async (t) => {
    const h = makeIo(await tempDir(t), { tty: true });
    assert.equal(await main(["--help"], h.io), 0);
    assert.match(h.stdout(), /████████╗/);
    assert.ok(h.stdout().includes("\u001b["));
    assert.match(h.stdout(), /Usage/);
  });

  it("prints plain help when piped or colors are disabled", async (t) => {
    const piped = makeIo(await tempDir(t));
    assert.equal(await main(["-h"], piped.io), 0);
    assert.doesNotMatch(piped.stdout(), /████████╗/);

    const plain = makeIo(await tempDir(t), { tty: true });
    assert.equal(await main(["-h", "--no-color"], plain.io), 0);
    assert.ok(!plain.stdout().includes("\u001b["));
  });

  it("returns 2 for usage errors and 1 for runtime errors", async (t) => {
    const root = await tempDir(t);
    const usage = makeIo(root);
    assert.equal(await main(["--nope"], usage.io), 2);
    assert.match(usage.stderr(), /error: Unknown option "--nope"/);

    const missing = makeIo(root);
    assert.equal(await main(["-i", join(root, "absent")], missing.io), 1);
    assert.match(missing.stderr(), /Cannot find/);
  });

  it("returns 1 for unexpected errors without a CliError", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "third-party-notices.config.mjs": "throw new TypeError('bad config');" });
    const h = makeIo(root);
    assert.equal(await main([], h.io), 1);
    assert.match(h.stderr(), /error: .*bad config/);
  });

  it("generates notices non-interactively", async (t) => {
    const root = await bareProject(t);
    await writeFiles(root, { "node_modules/bare/LICENSE": "MIT text" });
    const h = makeIo(root);
    assert.equal(await main(["-o", "-", "-q"], h.io), 0);
    assert.match(h.stdout(), /MIT text/);
    assert.equal(h.stderr(), "");
  });

  it("prompts on an interactive terminal and finishes the run", async (t) => {
    const root = await bareProject(t);
    const h = makeIo(root, { tty: true });
    const done = main(["-o", "-", "--no-spinner", "--eol", "lf"], h.io);
    await script(h.input, h.stderr, [
      [/How should this be handled\?/, "\u001b[B\r"],
      [/finish with a line containing only/, "Typed license\n.\n"],
    ]);
    assert.equal(await done, 0);
    assert.match(h.stdout(), /Typed license/);
    assert.match(h.stderr(), /████████╗/);
  });

  it("exits 130 when the user cancels a prompt", async (t) => {
    const root = await bareProject(t);
    const h = makeIo(root, { tty: true });
    const done = main(["-o", "-", "--no-spinner"], h.io);
    await script(h.input, h.stderr, [[/How should this be handled\?/, "\u0003"]]);
    assert.equal(await done, 130);
    assert.match(h.stderr(), /Cancelled/);
  });
});
