import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidPattern, matchesAny, matchesPackage } from "./patterns.js";

describe("matchesPackage", () => {
  it("matches names, name@version and regular expressions", () => {
    assert.equal(matchesPackage("a", "a", "1.0.0"), true);
    assert.equal(matchesPackage("a@1.0.0", "a", "1.0.0"), true);
    assert.equal(matchesPackage("a@2.0.0", "a", "1.0.0"), false);
    assert.equal(matchesPackage("/^@types\\//", "@types/node", "1.0.0"), true);
    assert.equal(matchesPackage("/PRETTIER/i", "prettier-x", "1.0.0"), true);
    assert.equal(matchesPackage("b", "a", "1.0.0"), false);
  });

  it("never matches a malformed regular expression", () => {
    assert.equal(matchesPackage("/(/", "anything", "1.0.0"), false);
  });
});

describe("isValidPattern", () => {
  it("only rejects malformed regular expressions", () => {
    assert.equal(isValidPattern("name@1.0.0"), true);
    assert.equal(isValidPattern("/^a/i"), true);
    assert.equal(isValidPattern("/(/"), false);
  });
});

describe("matchesAny", () => {
  it("is true when any pattern matches", () => {
    assert.equal(matchesAny(["x", "a"], "a", "1.0.0"), true);
    assert.equal(matchesAny([], "a", "1.0.0"), false);
  });
});
