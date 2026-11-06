import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateLicense, renderTemplate, SPDX_TEMPLATE_IDS, templateIdFor } from "./templates.js";

describe("templates", () => {
  it("matches bundled SPDX ids exactly, ignoring case and outer parentheses", () => {
    assert.equal(templateIdFor("MIT"), "MIT");
    assert.equal(templateIdFor("(isc)"), "ISC");
    assert.equal(templateIdFor("MIT OR Apache-2.0"), undefined);
    assert.equal(templateIdFor(undefined), undefined);
  });

  it("fills in the copyright holder for every template", () => {
    for (const id of SPDX_TEMPLATE_IDS) {
      assert.match(renderTemplate(id, "Ada Lovelace"), /Copyright \(c\) Ada Lovelace/, id);
    }
    assert.match(renderTemplate("ISC", undefined), /the package authors/);
    assert.match(renderTemplate("MIT", "Ada $& Co"), /Copyright \(c\) Ada \$& Co/);
  });

  it("refuses ids without a template", () => {
    assert.throws(() => renderTemplate("GPL-3.0-only", "X"), /No bundled template/);
  });

  it("generates text only for a declared license that has a template", () => {
    assert.match(generateLicense("MIT", "Ada") ?? "", /Copyright \(c\) Ada/);
    assert.equal(generateLicense("Proprietary", "Ada"), undefined);
    assert.equal(generateLicense(undefined, "Ada"), undefined);
  });
});
