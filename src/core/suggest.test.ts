import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { didYouMean } from "./suggest.js";

describe("didYouMean", () => {
  it("suggests a near candidate and nothing when none is close", () => {
    assert.equal(didYouMean("outpt", ["output", "input"]), "output");
    assert.equal(didYouMean("zzzzzzzz", ["output", "input"]), undefined);
    assert.equal(didYouMean("x", []), undefined);
  });
});
