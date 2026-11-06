import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ResolvedPackage } from "../core/types.js";
import { tempDir, writeFiles } from "../testing/fixtures.js";
import { fakeIo, script } from "../testing/io.js";
import { askForLicense } from "./license-prompt.js";

const pkg = (extra: Partial<ResolvedPackage> = {}): ResolvedPackage => ({
  name: "bare",
  version: "1.0.0",
  dir: "",
  license: "MIT",
  homepage: undefined,
  repository: undefined,
  author: "Ada Lovelace",
  ...extra,
});

const HOW = /How should this be handled\?/;
const PASTE = /finish with a line containing only/;

/** Starts the prompt and plays `steps` into it. */
async function ask(package_: ResolvedPackage, steps: Array<[RegExp, string]>) {
  const { io, input, output } = fakeIo();
  const answer = askForLicense(io, package_);
  await script(input, output, steps);
  return { answer: await answer, output: output() };
}

describe("askForLicense", () => {
  it("describes the package, then offers the matching template", async () => {
    const { answer, output } = await ask(pkg({ homepage: "https://example.com" }), [[HOW, "\u001b[B\u001b[B\r"]]);
    assert.match(output, /No license text found for bare@1\.0\.0/);
    assert.match(output, /declares MIT · https:\/\/example\.com/);
    assert.equal(answer?.generated, true);
    assert.match(answer?.text ?? "", /Copyright \(c\) Ada Lovelace/);
  });

  it("skips on Escape, and shows a missing license field", async () => {
    const { answer, output } = await ask(pkg({ license: undefined }), [[HOW, "\u001b"]]);
    assert.equal(answer, undefined);
    assert.match(output, /no license field/);
    assert.doesNotMatch(output, /template/);
  });

  it("accepts pasted text, retrying after an empty paste", async () => {
    const { answer, output } = await ask(pkg(), [
      [HOW, "\u001b[B\r"],
      [PASTE, ".\n"],
      [/Nothing was entered/, ""],
      [HOW, "\u001b[B\r"],
      [PASTE, "Line one\nLine two\n.\n"],
    ]);
    assert.deepEqual(answer, { text: "Line one\nLine two", generated: false });
    assert.match(output, /Nothing was entered/);
  });

  it("reads a license file, retrying after unreadable and empty files", async (t) => {
    const dir = await tempDir(t);
    await writeFiles(dir, { "empty.txt": "  \n", "real.txt": "From a file" });
    const { answer, output } = await ask(pkg({ license: "Custom" }), [
      [HOW, "\r"],
      [/Path to license file:/, `${join(dir, "missing.txt")}\n`],
      [/Could not read/, ""],
      [HOW, "\r"],
      [/Path to license file:/, `${join(dir, "empty.txt")}\n`],
      [/That file is empty/, ""],
      [HOW, "\r"],
      [/Path to license file:/, `${join(dir, "real.txt")}\n`],
    ]);
    assert.deepEqual(answer, { text: "From a file", generated: false });
    assert.match(output, /Could not read/);
  });
});
