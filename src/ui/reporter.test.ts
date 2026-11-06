import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CliError } from "../errors.js";
import { capture } from "../testing/io.js";
import { stripAnsi } from "./ansi.js";
import type { UiEnv } from "./env.js";
import { ConsoleReporter, type SummaryData } from "./reporter.js";

const plain: UiEnv = { color: false, unicode: true, animate: false, hero: false, hyperlinks: false, columns: 80 };
const animated: UiEnv = { ...plain, animate: true, color: true };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const data: SummaryData = {
  packages: 1,
  uniqueLicenses: 1,
  breakdown: [],
  outputPath: undefined,
  outputLabel: "stdout",
  bytes: 1,
  elapsedMs: 1,
  findings: [],
};

describe("ConsoleReporter", () => {
  it("prints a plain, line-based run without control sequences", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, plain);
    await reporter.banner("1.0.0");
    reporter.step("Resolving dependencies").succeed("12 packages");
    reporter.summary(data);
    assert.match(text(), /third-party-notices v1\.0\.0/);
    assert.match(text(), /✔ Resolving dependencies 12 packages \(\d+ms\)/);
    assert.ok(!text().includes("\u001b"));
  });

  it("prints nothing but errors in quiet mode", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, plain, { quiet: true });
    await reporter.banner("1.0.0");
    reporter.step("x").succeed();
    reporter.summary(data);
    assert.equal(text(), "");
    reporter.error(new CliError("still shown"));
    assert.match(text(), /error: still shown/);
  });

  it("collects warnings always and notes only when verbose", () => {
    const quiet = capture();
    const regular = new ConsoleReporter(quiet.out, plain);
    regular.warn("careful");
    regular.note("detail");
    regular.summary(data);
    assert.match(quiet.text(), /▲ careful/);
    assert.doesNotMatch(quiet.text(), /detail/);

    const loud = capture();
    const verbose = new ConsoleReporter(loud.out, plain, { verbose: true });
    verbose.note("detail");
    verbose.summary(data);
    assert.match(loud.text(), /ℹ detail/);
  });

  it("reveals the hero banner row by row when animating, and at once otherwise", async () => {
    const animatedOut = capture();
    await new ConsoleReporter(animatedOut.out, { ...animated, hero: true, columns: 100 }, { revealDelayMs: 0 }).banner(
      "2.0.0",
    );
    const staticOut = capture();
    await new ConsoleReporter(staticOut.out, { ...plain, hero: true, columns: 100 }).banner("2.0.0");
    for (const text of [stripAnsi(animatedOut.text()), staticOut.text()]) {
      assert.match(text, /████████╗/);
      assert.match(text, /third-party-notices v2\.0\.0/);
    }
  });

  it("pauses the active step while an action runs, and propagates the result or error", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, animated);
    const step = reporter.step("Reading");
    await sleep(100);
    const result = await reporter.suspend(async () => {
      const paused = text().length;
      await sleep(250);
      assert.equal(text().length, paused, "no frames while paused");
      return 42;
    });
    assert.equal(result, 42);
    await sleep(120);
    step.stop();
    await assert.rejects(
      reporter.suspend(async () => {
        throw new Error("x");
      }),
      /x/,
    );
  });

  it("stops an active animation before printing an error", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, animated);
    reporter.step("Working");
    await sleep(100);
    reporter.error(new CliError("bad", { hint: "fix it" }));
    assert.match(stripAnsi(text()), /error: bad\nhint: {2}fix it/);
    assert.ok(text().includes("\u001b[?25h"));
  });
});
