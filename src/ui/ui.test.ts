import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CancelledError } from "../errors.js";
import { capture, fakeIo } from "../testing/io.js";
import { createStyle, stripAnsi, truncate, visibleLength } from "./ansi.js";
import { renderBanner } from "./banner.js";
import { detectEnv } from "./env.js";
import { confirm, readLine, readMultiline, select } from "./prompt.js";
import { ConsoleReporter, formatBytes, formatDuration } from "./reporter.js";

describe("detectEnv", () => {
  const tty = { isTTY: true, columns: 100 };

  it("enables color and animation on a TTY", () => {
    const env = detectEnv(tty, { LANG: "en_US.UTF-8" }, {}, "linux");
    assert.deepEqual([env.color, env.animate, env.hero, env.unicode, env.columns], [true, true, true, true, 100]);
  });

  it("stays plain when piped", () => {
    const env = detectEnv({}, {}, {}, "linux");
    assert.deepEqual([env.color, env.animate, env.hero, env.hyperlinks], [false, false, false, false]);
    assert.equal(env.columns, 80);
  });

  it("honors NO_COLOR, FORCE_COLOR and --no-color", () => {
    assert.equal(detectEnv(tty, { NO_COLOR: "1" }, {}, "linux").color, false);
    assert.equal(detectEnv(tty, { FORCE_COLOR: "0" }, {}, "linux").color, false);
    assert.equal(detectEnv({}, { FORCE_COLOR: "1" }, {}, "linux").color, true);
    assert.equal(detectEnv(tty, { FORCE_COLOR: "1", NO_COLOR: "1" }, {}, "linux").color, false);
    assert.equal(detectEnv(tty, {}, { noColor: true }, "linux").color, false);
  });

  it("disables animation and the hero in CI and dumb terminals, spinner with --no-spinner", () => {
    assert.deepEqual(pick(detectEnv(tty, { CI: "true" }, {}, "linux")), [true, false, false]);
    assert.deepEqual(pick(detectEnv(tty, { TERM: "dumb" }, {}, "linux")), [false, false, false]);
    assert.deepEqual(pick(detectEnv(tty, {}, { noSpinner: true }, "linux")), [true, false, true]);
  });

  it("falls back to ASCII when Unicode is unlikely to render", () => {
    assert.equal(detectEnv(tty, { TPN_ASCII: "1" }, {}, "linux").unicode, false);
    assert.equal(detectEnv(tty, { TERM: "linux" }, {}, "linux").unicode, false);
    assert.equal(detectEnv(tty, { LANG: "C" }, {}, "linux").unicode, false);
    assert.equal(detectEnv(tty, {}, {}, "win32").unicode, false);
    assert.equal(detectEnv(tty, { WT_SESSION: "x" }, {}, "win32").unicode, true);
  });
});

function pick(env: { color: boolean; animate: boolean; hero: boolean }): boolean[] {
  return [env.color, env.animate, env.hero];
}

describe("ansi helpers", () => {
  it("styles only when color is on", () => {
    assert.equal(createStyle({ color: false }).red("x"), "x");
    assert.equal(createStyle({ color: true }).red("x"), "\u001b[31mx\u001b[39m");
  });

  it("emits OSC 8 hyperlinks only when enabled", () => {
    assert.equal(createStyle({ color: true, hyperlinks: false }).link("u", "t"), "t");
    assert.equal(stripAnsi(createStyle({ color: true, hyperlinks: true }).link("file:///x", "t")), "t");
  });

  it("measures and truncates visible text", () => {
    const styled = createStyle({ color: true }).bold("héllo");
    assert.equal(visibleLength(styled), 5);
    assert.equal(truncate("abcdefghij", 6), "abcde…");
    assert.equal(truncate("abc", 6), "abc");
  });
});

describe("renderBanner", () => {
  const style = createStyle({ color: false });

  it("renders the Unicode hero with title and tagline", () => {
    const lines = renderBanner(style, { version: "1.2.3", unicode: true, columns: 100 });
    assert.equal(lines.length, 6);
    assert.ok(lines[0]?.startsWith("████████╗"));
    assert.ok(lines.some((line) => line.includes("third-party-notices v1.2.3")));
  });

  it("renders an ASCII hero", () => {
    const lines = renderBanner(style, { version: "1.2.3", unicode: false, columns: 100 });
    assert.equal(lines.length, 5);
    assert.ok(lines.every((line) => /^[\x20-\x7e]*$/.test(line)));
  });

  it("collapses to one line on narrow terminals", () => {
    assert.deepEqual(renderBanner(style, { version: "1.2.3", unicode: true, columns: 40 }), [
      "third-party-notices v1.2.3",
    ]);
  });
});

const plainEnv = { color: false, unicode: true, animate: false, hero: false, hyperlinks: false, columns: 80 };

describe("ConsoleReporter", () => {
  it("prints plain, line-based steps without control sequences", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, plainEnv);
    await reporter.banner("1.0.0");
    const step = reporter.step("Resolving dependencies");
    step.update("ignored while not animating");
    step.succeed("12 packages");
    const output = text();
    assert.match(output, /third-party-notices v1\.0\.0/);
    assert.match(output, /✔ Resolving dependencies 12 packages \(\d+ms\)/);
    assert.ok(!output.includes("\u001b"));
  });

  it("is silent in quiet mode", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, plainEnv, { quiet: true });
    await reporter.banner("1.0.0");
    reporter.step("x").succeed();
    reporter.summary({
      packages: 1,
      uniqueLicenses: 1,
      breakdown: [],
      outputPath: undefined,
      outputLabel: "stdout",
      bytes: 1,
      elapsedMs: 1,
    });
    assert.equal(text(), "");
  });

  it("animates with a hidden cursor that is always restored", async () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, { ...plainEnv, animate: true, color: true });
    const step = reporter.step("Reading licenses");
    step.update("1/2 foo");
    await new Promise((resolve) => setTimeout(resolve, 200));
    step.succeed();
    const output = text();
    assert.ok(output.includes("\u001b[?25l"), "cursor hidden");
    assert.ok(output.lastIndexOf("\u001b[?25h") > output.indexOf("\u001b[?25l"), "cursor shown again");
    assert.match(stripAnsi(output), /⠋ Reading licenses/);
  });

  it("prints a summary with breakdown, warnings and a summary line", () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, plainEnv);
    reporter.warn("Skipped x@1.0.0: no license text");
    reporter.summary({
      packages: 4,
      uniqueLicenses: 2,
      breakdown: [
        ["MIT", 3],
        ["ISC", 1],
      ],
      outputPath: undefined,
      outputLabel: "NOTICE.txt",
      bytes: 2048,
      elapsedMs: 1500,
    });
    const output = text();
    assert.match(output, /Wrote NOTICE\.txt 2\.0 KB · 1\.5s/);
    assert.match(output, /4 packages · 2 unique license texts/);
    assert.match(output, /MIT {2}█+ 3/);
    assert.match(output, /▲ Skipped x@1\.0\.0/);
  });

  it("prints errors with hints", () => {
    const { out, text } = capture();
    const reporter = new ConsoleReporter(out, plainEnv);
    reporter.error(Object.assign(new Error("boom"), {}));
    assert.match(text(), /error: boom/);
  });

  it("formats durations and sizes", () => {
    assert.equal(formatDuration(12), "12ms");
    assert.equal(formatDuration(2500), "2.5s");
    assert.equal(formatDuration(42_000), "42s");
    assert.equal(formatBytes(10), "10 B");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  });
});

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("prompts", () => {
  const choices = [
    { label: "One", value: 1 },
    { label: "Two", value: 2 },
    { label: "Three", value: 3 },
  ];

  it("select moves with arrows and confirms with Enter", async () => {
    const { io, input, rawModes } = fakeIo();
    const result = select(io, "Pick", choices);
    await tick();
    input.write("\u001b[B");
    await tick();
    input.write("\u001b[B");
    await tick();
    input.write("\u001b[A");
    await tick();
    input.write("\r");
    assert.equal(await result, 2);
    assert.deepEqual(rawModes, [true, false]);
  });

  it("select supports number shortcuts and Escape", async () => {
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

  it("select rejects on Ctrl-C and restores the cursor", async () => {
    const { io, input, output } = fakeIo();
    const result = select(io, "Pick", choices);
    await tick();
    input.write("\u0003");
    await assert.rejects(result, CancelledError);
    assert.ok(output().endsWith("\u001b[?25h"));
  });

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

  it("readMultiline collects lines, including blanks, until a lone dot", async () => {
    const { io, input } = fakeIo();
    const result = readMultiline(io, "Paste");
    await tick();
    input.write("line one\n\nline three\n.\nignored\n");
    assert.equal(await result, "line one\n\nline three");
  });
});
