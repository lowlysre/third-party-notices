import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CliError } from "../errors.js";
import { capture } from "../testing/io.js";
import { stripAnsi } from "./ansi.js";
import type { UiEnv } from "./env.js";
import { ConsoleReporter } from "./reporter.js";

const base: UiEnv = { color: false, unicode: true, animate: false, hero: false, hyperlinks: false, columns: 80 };
const animated: UiEnv = { ...base, animate: true, color: true };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const summary = {
  packages: 3,
  uniqueLicenses: 1,
  breakdown: [] as Array<[string, number]>,
  outputPath: undefined,
  outputLabel: "stdout",
  bytes: 10,
  elapsedMs: 5,
};

describe("ConsoleReporter steps", () => {
  it("marks failed steps and ignores results after a step is finished", () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, base);
    const step = reporter.step("Resolving");
    step.fail("boom");
    step.succeed("late");
    step.fail("later");
    assert.equal(text().match(/Resolving/g)?.length, 1);
    assert.match(text(), /✖ Resolving boom/);
  });

  it("stop clears the animation without printing a result", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, animated);
    const step = reporter.step("Working");
    await sleep(100);
    step.stop();
    step.stop();
    step.succeed("ignored");
    assert.ok(!stripAnsi(text()).includes("ignored"));
    assert.ok(text().endsWith("\u001b[?25h"));
  });

  it("uses the final detail when succeed gets none", () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, base);
    const step = reporter.step("Reading");
    step.update("4/4");
    step.succeed();
    assert.match(text(), /Reading 4\/4/);
  });

  it("pauses the spinner while an action runs, then resumes it", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, animated);
    const step = reporter.step("Reading");
    await sleep(100);
    const before = text().length;
    const result = await reporter.suspend(async () => {
      const paused = text().length;
      await sleep(250);
      assert.equal(text().length, paused, "no frames while paused");
      return 42;
    });
    assert.equal(result, 42);
    await sleep(120);
    assert.ok(text().length > before, "frames resume");
    step.succeed();
  });

  it("suspend works with no active step and when the action throws", async () => {
    const reporter = new ConsoleReporter(capture().out, base);
    assert.equal(await reporter.suspend(async () => 1), 1);
    await assert.rejects(
      reporter.suspend(async () => {
        throw new Error("x");
      }),
      /x/,
    );
  });

  it("truncates long details to the terminal width", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, { ...animated, columns: 30 });
    const step = reporter.step("Reading");
    step.update("a-very-long-package-name-that-cannot-fit-in-the-terminal");
    await sleep(100);
    step.stop();
    assert.match(stripAnsi(text()), /…/);
  });
});

describe("ConsoleReporter banner", () => {
  it("reveals the hero row by row on an animated terminal", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, { ...animated, hero: true, columns: 100 }, { revealDelayMs: 0 });
    await reporter.banner("2.0.0");
    const output = stripAnsi(text());
    assert.match(output, /████████╗/);
    assert.match(output, /third-party-notices v2\.0\.0/);
  });

  it("shows the hero without animation delays when not animating", async () => {
    const { out, text } = capture();
    await new ConsoleReporter(out, { ...base, hero: true, columns: 100 }).banner("2.0.0");
    assert.match(text(), /████████╗/);
  });
});

describe("ConsoleReporter summary", () => {
  it("links the output path and abbreviates long breakdowns", () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, { ...base, color: true, hyperlinks: true });
    const breakdown = Array.from({ length: 9 }, (_, i): [string, number] => [`LIC-${i}`, 9 - i]);
    reporter.summary({ ...summary, breakdown, outputPath: "C:\\tmp\\NOTICE.txt", outputLabel: "NOTICE.txt" });
    assert.ok(text().includes("\u001b]8;;file:///"), "OSC 8 link");
    assert.match(stripAnsi(text()), /… and 3 more/);
  });
});

describe("ConsoleReporter errors", () => {
  it("prints the message and hint of a CliError", () => {
    const { out, text } = capture();
    new ConsoleReporter(out, base).error(new CliError("first\nsecond", { hint: "do this" }));
    assert.equal(text(), "error: first\n       second\nhint:  do this\n");
  });

  it("omits the hint line when there is none", () => {
    const { out, text } = capture();
    new ConsoleReporter(out, base).error(new CliError("plain"));
    assert.equal(text(), "error: plain\n");
  });

  it("prints non-Error values and stacks when debugging", () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, base);
    reporter.error("just a string");
    assert.match(text(), /error: just a string/);

    const previous = process.env.DEBUG;
    process.env.DEBUG = "third-party-notices";
    try {
      const error = new Error("kaboom");
      reporter.error(error);
      assert.ok(text().includes(error.stack ?? "missing"));
    } finally {
      if (previous === undefined) {
        delete process.env.DEBUG;
      } else {
        process.env.DEBUG = previous;
      }
    }
  });

  it("stops an active animation before printing an error", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, animated);
    reporter.step("Working");
    await sleep(100);
    reporter.error(new CliError("bad"));
    assert.match(stripAnsi(text()), /error: bad/);
    assert.ok(text().includes("\u001b[?25h"));
  });
});
