import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStyle, padEnd, stripAnsi, truncate, visibleLength } from "./ansi.js";
import { renderBanner } from "./banner.js";

describe("ansi helpers", () => {
  it("styles only when color is on", () => {
    assert.equal(createStyle({ color: false }).red("x"), "x");
    assert.equal(createStyle({ color: true }).red("x"), "\u001b[31mx\u001b[39m");
  });

  it("paints success marks in bold bright green", () => {
    assert.equal(createStyle({ color: false }).success("✔"), "✔");
    assert.equal(createStyle({ color: true }).success("✔"), "\u001b[1m\u001b[92m✔\u001b[39m\u001b[22m");
  });

  it("emits OSC 8 hyperlinks only when enabled", () => {
    assert.equal(createStyle({ color: true, hyperlinks: false }).link("u", "t"), "t");
    assert.equal(stripAnsi(createStyle({ color: true, hyperlinks: true }).link("file:///x", "t")), "t");
  });

  it("measures, pads and truncates visible text", () => {
    const styled = createStyle({ color: true }).bold("héllo");
    assert.equal(visibleLength(styled), 5);
    assert.equal(padEnd(styled, 7), `${styled}  `);
    assert.equal(truncate("abcdefghij", 6), "abcde…");
    assert.equal(truncate("abc", 6), "abc");
    assert.equal(truncate("abcdef", 1), "a");
  });
});

describe("renderBanner", () => {
  const style = createStyle({ color: false });

  it("renders the Unicode hero with the title and tagline", () => {
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
