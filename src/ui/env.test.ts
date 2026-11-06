import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectEnv } from "./env.js";

describe("detectEnv", () => {
  const tty = { isTTY: true, columns: 100 };
  const pick = (env: ReturnType<typeof detectEnv>) => [env.color, env.animate, env.hero];

  it("enables color, animation and the hero on a TTY", () => {
    const env = detectEnv(tty, { LANG: "en_US.UTF-8" }, {}, "linux");
    assert.deepEqual([...pick(env), env.unicode, env.hyperlinks, env.columns], [true, true, true, true, true, 100]);
  });

  it("stays plain when piped", () => {
    const env = detectEnv({}, {}, {}, "linux");
    assert.deepEqual([...pick(env), env.hyperlinks, env.columns], [false, false, false, false, 80]);
  });

  it("honors NO_COLOR, FORCE_COLOR and --no-color, with NO_COLOR winning", () => {
    assert.equal(detectEnv(tty, { NO_COLOR: "1" }, {}, "linux").color, false);
    assert.equal(detectEnv(tty, { FORCE_COLOR: "0" }, {}, "linux").color, false);
    assert.equal(detectEnv({}, { FORCE_COLOR: "1" }, {}, "linux").color, true);
    assert.equal(detectEnv(tty, { FORCE_COLOR: "1", NO_COLOR: "1" }, {}, "linux").color, false);
    assert.equal(detectEnv(tty, {}, { noColor: true }, "linux").color, false);
  });

  it("drops animation and the hero in CI and on dumb terminals, and the spinner with --no-spinner", () => {
    assert.deepEqual(pick(detectEnv(tty, { CI: "true" }, {}, "linux")), [true, false, false]);
    assert.deepEqual(pick(detectEnv(tty, { TERM: "dumb" }, {}, "linux")), [false, false, false]);
    assert.deepEqual(pick(detectEnv(tty, {}, { noSpinner: true }, "linux")), [true, false, true]);
  });

  it("falls back to ASCII where Unicode is unlikely to render", () => {
    assert.equal(detectEnv(tty, { TPN_ASCII: "1" }, {}, "linux").unicode, false);
    assert.equal(detectEnv(tty, { TERM: "linux" }, {}, "linux").unicode, false);
    assert.equal(detectEnv(tty, { LANG: "C" }, {}, "linux").unicode, false);
    assert.equal(detectEnv(tty, {}, {}, "win32").unicode, false);
    assert.equal(detectEnv(tty, { WT_SESSION: "x" }, {}, "win32").unicode, true);
  });
});
