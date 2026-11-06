import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPTIONS } from "./args.js";
import { helpText } from "./help.js";
import { createStyle } from "./ui/ansi.js";

describe("helpText", () => {
  const plain = createStyle({ color: false });

  it("documents every option, the alias and an example", () => {
    const text = helpText(plain, 100);
    for (const { name, short } of OPTIONS) {
      assert.ok(text.includes(`--${name}`), name);
      if (short) assert.ok(text.includes(`-${short}, --${name}`), `-${short}`);
    }
    assert.match(text, /\(alias: tpn\)/);
    assert.match(text, /\$ tpn --ci --overwrite/);
  });

  it("fits long lines to the terminal width", () => {
    for (const columns of [60, 80]) {
      const tooWide = helpText(plain, columns)
        .split("\n")
        .filter((line) => line.length > columns);
      assert.deepEqual(tooWide, [], `${columns} columns`);
    }
  });
});
