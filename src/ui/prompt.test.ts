import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CancelledError } from "../errors.js";
import { fakeIo } from "../testing/io.js";
import { confirm, readLine, readMultiline, select } from "./prompt.js";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const choices = [
  { label: "One", value: 1 },
  { label: "Two", value: 2 },
  { label: "Three", value: 3 },
];

describe("select", () => {
  it("moves with the arrow keys and confirms with Enter", async () => {
    const { io, input, rawModes } = fakeIo();
    const result = select(io, "Pick", choices);
    await tick();
    for (const key of ["\u001b[B", "\u001b[B", "\u001b[A", "\r"]) {
      input.write(key);
      await tick();
    }
    assert.equal(await result, 2);
    assert.deepEqual(rawModes, [true, false]);
  });

  it("supports number shortcuts and Escape", async () => {
    const first = fakeIo();
    const picked = select(first.io, "Pick", choices);
    await tick();
    first.input.write("3");
    await tick();
    first.input.write("\r");
    assert.equal(await picked, 3);

    const second = fakeIo();
    const escaped = select(second.io, "Pick", choices, { escape: 99 });
    await tick();
    second.input.write("\u001b");
    assert.equal(await escaped, 99);
  });

  it("rejects on Ctrl-C and restores the cursor", async () => {
    const { io, input, output } = fakeIo();
    const result = select(io, "Pick", choices);
    await tick();
    input.write("\u0003");
    await assert.rejects(result, CancelledError);
    assert.ok(output().endsWith("\u001b[?25h"));
  });
  it("rejects when the input ends and restores the terminal", async () => {
    const { io, input, output, rawModes } = fakeIo();
    const result = select(io, "Pick", choices);
    await tick();
    input.end();
    await assert.rejects(result, CancelledError);
    assert.deepEqual(rawModes, [true, false]);
    assert.ok(output().endsWith("\u001b[?25h"));
  });

  it("moves up over every physical row when lines wrap", async () => {
    const { io, input, output } = fakeIo();
    const result = select({ ...io, columns: 10 }, "A long question", choices);
    await tick();
    input.write("\r");
    await result;
    // 1 question row wrapping onto 2, plus 3 choices of 1 row each ("  > Three" is 10 columns).
    assert.ok(output().includes("\u001b[5A"), "cursor moved up 5 rows");
  });
});

describe("text prompts", () => {
  it("confirm resolves to a boolean", async () => {
    const { io, input } = fakeIo();
    const result = confirm(io, "Sure?");
    await tick();
    input.write("\u001b[B");
    await tick();
    input.write("\r");
    assert.equal(await result, false);
  });

  it("readLine returns a trimmed line", async () => {
    const { io, input } = fakeIo();
    const result = readLine(io, "Path:");
    await tick();
    input.write("  ./LICENSE  \n");
    assert.equal(await result, "./LICENSE");
  });

  it("readMultiline keeps blank lines until a lone dot", async () => {
    const { io, input } = fakeIo();
    const result = readMultiline(io, "Paste");
    await tick();
    input.write("line one\n\nline three\n.\nignored\n");
    assert.equal(await result, "line one\n\nline three");
  });

  it("readLine rejects when the input ends", async () => {
    const { io, input } = fakeIo();
    const result = readLine(io, "Path:");
    await tick();
    input.end();
    await assert.rejects(result, CancelledError);
  });
});
