import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../core/policy.js";
import { CliError } from "../errors.js";
import { createStyle, stripAnsi } from "./ansi.js";
import type { UiEnv } from "./env.js";
import { formatBytes, formatDuration, renderError, renderSummary, type SummaryData } from "./format.js";
import { createTerminal } from "./terminal.js";

const env: UiEnv = { color: false, unicode: true, animate: false, hero: false, hyperlinks: false, columns: 80 };
const term = createTerminal({ write() {} }, env);
const none = { warnings: [], notes: [] };

const data: SummaryData = {
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
  findings: [],
};

describe("formatDuration and formatBytes", () => {
  it("picks a readable unit", () => {
    assert.deepEqual([12, 2500, 42_000].map(formatDuration), ["12ms", "2.5s", "42s"]);
    assert.deepEqual([10, 1536, 5 * 1024 * 1024].map(formatBytes), ["10 B", "1.5 KB", "5.0 MB"]);
  });
});

describe("renderSummary", () => {
  it("shows what was written, the totals and a license chart", () => {
    const text = renderSummary(term, data, none);
    assert.match(text, /✔ Wrote NOTICE\.txt 2\.0 KB · 1\.5s/);
    assert.match(text, /4 packages · 2 unique license texts/);
    assert.match(text, /MIT {2}█+ 3/);
    assert.match(text, /ISC {2}█+ 1/);
  });

  it("collapses a long chart and links the output path when hyperlinks are on", () => {
    const linked = createTerminal({ write() {} }, { ...env, color: true, hyperlinks: true });
    const breakdown = Array.from({ length: 9 }, (_, i) => [`LIC-${i}`, 9 - i] as const);
    const text = renderSummary(linked, { ...data, breakdown, outputPath: "C:\\tmp\\NOTICE.txt" }, none);
    assert.ok(text.includes("\u001b]8;;file:///"));
    assert.match(stripAnsi(text), /… and 3 more/);
  });

  it("lists license review findings, capped, with the remaining count", () => {
    const finding = (name: string, category: Finding["category"], id: string): Finding => ({
      name,
      version: "1.0.0",
      category,
      id,
    });
    const findings = [
      finding("evil", "network-copyleft", "AGPL-3.0-only"),
      finding("none", "unclear", "(none)"),
      ...Array.from({ length: 12 }, (_, i) => finding(`gpl${i}`, "strong-copyleft", "GPL-3.0-only")),
    ];
    const text = renderSummary(term, { ...data, findings }, none);
    assert.match(text, /▲ License review/);
    assert.match(text, /Network copyleft {2}AGPL-3\.0-only {2}evil@1\.0\.0/);
    assert.match(text, /Unclear terms {5}\(none\) {9}none@1\.0\.0/);
    assert.match(text, /… and 2 more/);
  });

  it("appends warnings and notes", () => {
    const text = renderSummary(term, data, { warnings: ["Skipped x@1.0.0"], notes: ["x@1.0.0 ships no license file"] });
    assert.match(text, /▲ Skipped x@1\.0\.0/);
    assert.match(text, /ℹ x@1\.0\.0 ships no license file/);
  });
});

describe("renderError", () => {
  const style = createStyle({ color: false });

  it("prints a CliError's message, continuation lines and hint", () => {
    assert.equal(
      renderError(new CliError("first\nsecond", { hint: "do this" }), style, false),
      "error: first\n       second\nhint:  do this\n",
    );
    assert.equal(renderError(new CliError("plain"), style, false), "error: plain\n");
  });

  it("prints other errors without a stack unless debugging", () => {
    const error = new Error("kaboom");
    assert.equal(renderError(error, style, false), "error: kaboom\n");
    assert.ok(renderError(error, style, true).includes(error.stack ?? "missing"));
    assert.equal(renderError("just a string", style, true), "error: just a string\n");
  });
});
