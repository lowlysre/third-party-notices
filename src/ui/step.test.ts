import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capture } from "../testing/io.js";
import { stripAnsi } from "./ansi.js";
import type { UiEnv } from "./env.js";
import { AnimatedStep } from "./step.js";
import { createTerminal } from "./terminal.js";

const plain: UiEnv = { color: false, unicode: true, animate: false, hero: false, hyperlinks: false, columns: 80 };
const animated: UiEnv = { ...plain, animate: true, color: true };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function start(env: UiEnv, label = "Working") {
  const { out, text } = capture();
  let ended = 0;
  const step = new AnimatedStep(createTerminal(out, env), label, () => ended++);
  return { step, text, ended: () => ended };
}

describe("AnimatedStep without animation", () => {
  it("prints a single result line with the detail and timing", () => {
    const { step, text, ended } = start(plain, "Reading");
    step.update("4/4");
    step.succeed();
    assert.match(text(), /^ {2}✔ Reading 4\/4 \(\d+ms\)\n$/);
    assert.equal(ended(), 1);
  });

  it("marks failures and ignores anything after the step is finished", () => {
    const { step, text, ended } = start(plain);
    step.fail("boom");
    step.succeed("late");
    step.stop();
    assert.equal(text().match(/Working/g)?.length, 1);
    assert.match(text(), /✖ Working boom/);
    assert.equal(ended(), 1);
  });
});

describe("AnimatedStep with animation", () => {
  it("draws frames with the cursor hidden, then restores it", async () => {
    const { step, text } = start(animated, "Reading licenses");
    step.update("1/2 foo");
    await sleep(200);
    step.succeed();
    const output = text();
    assert.ok(output.includes("\u001b[?25l"), "cursor hidden");
    assert.ok(output.lastIndexOf("\u001b[?25h") > output.indexOf("\u001b[?25l"), "cursor shown again");
    assert.match(stripAnsi(output), /⠋ Reading licenses/);
    assert.match(stripAnsi(output), /1\/2 foo/);
  });

  it("truncates a long detail to the terminal width", async () => {
    const { step, text } = start({ ...animated, columns: 30 }, "Reading");
    step.update("a-very-long-package-name-that-cannot-fit-in-the-terminal");
    await sleep(100);
    step.stop();
    assert.match(stripAnsi(text()), /…/);
  });

  it("stop clears the line without printing a result", async () => {
    const { step, text, ended } = start(animated);
    await sleep(100);
    step.stop();
    step.stop();
    step.succeed("ignored");
    assert.ok(!stripAnsi(text()).includes("ignored"));
    assert.ok(text().endsWith("\u001b[?25h"));
    assert.equal(ended(), 1);
  });

  it("pauses drawing and resumes it", async () => {
    const { step, text } = start(animated);
    await sleep(100);
    step.pause();
    const paused = text().length;
    await sleep(200);
    assert.equal(text().length, paused, "no frames while paused");
    step.resume();
    await sleep(120);
    assert.ok(text().length > paused, "frames resume");
    step.stop();
  });
});
