import { pathToFileURL } from "node:url";
import { CATEGORY_LABELS, type Finding } from "../core/policy.js";
import { CliError } from "../errors.js";
import { padEnd, type Style, truncate } from "./ansi.js";
import type { Terminal } from "./terminal.js";

export interface SummaryData {
  packages: number;
  uniqueLicenses: number;
  breakdown: ReadonlyArray<readonly [license: string, count: number]>;
  /** Absolute path of the written file, or undefined for stdout. */
  outputPath: string | undefined;
  outputLabel: string;
  bytes: number;
  elapsedMs: number;
  /** Packages whose declared license needs a human review, most severe first. */
  findings: readonly Finding[];
}

const MAX_BREAKDOWN = 6;
const MAX_FINDINGS = 12;

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderBreakdown({ style, symbols, env }: Terminal, breakdown: SummaryData["breakdown"]): string[] {
  const top = breakdown.slice(0, MAX_BREAKDOWN);
  if (top.length === 0) return [];
  const nameWidth = Math.max(...top.map(([name]) => name.length));
  const max = Math.max(...top.map(([, count]) => count));
  const barWidth = Math.min(24, Math.max(8, env.columns - nameWidth - 14));
  const rows = top.map(([name, count]) => {
    const bar = symbols.bar.repeat(Math.max(1, Math.round((count / max) * barWidth)));
    return `  ${padEnd(name, nameWidth)}  ${style.cyan(bar)} ${style.dim(String(count))}`;
  });
  const hidden = breakdown.length - top.length;
  return ["", ...rows, ...(hidden > 0 ? [`  ${style.dim(`${symbols.ellipsis} and ${hidden} more`)}`] : [])];
}

function renderFindings({ style, symbols }: Terminal, findings: readonly Finding[]): string[] {
  if (findings.length === 0) return [];
  const shown = findings.slice(0, MAX_FINDINGS);
  const labelWidth = Math.max(...shown.map((finding) => CATEGORY_LABELS[finding.category].length));
  const idWidth = Math.min(28, Math.max(...shown.map((finding) => finding.id.length)));
  const rows = shown.map((finding) => {
    const label = style.yellow(padEnd(CATEGORY_LABELS[finding.category], labelWidth));
    return `    ${label}  ${padEnd(truncate(finding.id, idWidth), idWidth)}  ${style.dim(`${finding.name}@${finding.version}`)}`;
  });
  const hidden = findings.length - shown.length;
  return [
    "",
    `  ${style.yellow(symbols.warn)} ${style.bold("License review")}`,
    ...rows,
    ...(hidden > 0 ? [`    ${style.dim(`${symbols.ellipsis} and ${hidden} more`)}`] : []),
  ];
}

/** The closing summary: what was written, a license chart, review findings, warnings and notes. */
export function renderSummary(
  term: Terminal,
  data: SummaryData,
  extras: { warnings: readonly string[]; notes: readonly string[] },
): string {
  const { style, symbols } = term;
  const target = data.outputPath ? style.link(pathToFileURL(data.outputPath).href, data.outputLabel) : data.outputLabel;
  const stats = `${formatBytes(data.bytes)} ${symbols.bullet} ${formatDuration(data.elapsedMs)}`;
  const lines = [
    "",
    `  ${style.success(symbols.ok)} ${style.bold(`Wrote ${target}`)} ${style.dim(stats)}`,
    "",
    `  ${style.bold(String(data.packages))} packages ${style.dim(symbols.bullet)} ${style.bold(String(data.uniqueLicenses))} unique license texts`,
    ...renderBreakdown(term, data.breakdown),
    ...renderFindings(term, data.findings),
    ...(extras.warnings.length > 0
      ? ["", ...extras.warnings.map((text) => `  ${style.yellow(symbols.warn)} ${text}`)]
      : []),
    ...(extras.notes.length > 0
      ? ["", ...extras.notes.map((text) => `  ${style.dim(`${symbols.info} ${text}`)}`)]
      : []),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

/** `error:` and `hint:` lines. Unexpected errors add their stack when `debug` is set. */
export function renderError(error: unknown, style: Style, debug: boolean): string {
  const label = style.bold(style.red("error:"));
  if (error instanceof CliError) {
    const hint = error.hint ? `${style.bold(style.cyan("hint:"))}  ${error.hint}\n` : "";
    return `${label} ${error.message.split("\n").join("\n       ")}\n${hint}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const stack = debug && error instanceof Error && error.stack ? `${style.dim(error.stack)}\n` : "";
  return `${label} ${message}\n${stack}`;
}
