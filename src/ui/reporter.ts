import { pathToFileURL } from "node:url";
import { CliError } from "../errors.js";
import { createStyle, cursor, padEnd, type Style, truncate } from "./ansi.js";
import { renderBanner } from "./banner.js";
import type { UiEnv } from "./env.js";
import { getSymbols, type Symbols } from "./symbols.js";

export interface Step {
  update(detail: string): void;
  succeed(detail?: string): void;
  fail(detail?: string): void;
  /** Stops animating and clears the line without printing a result. */
  stop(): void;
}

export interface SummaryData {
  packages: number;
  uniqueLicenses: number;
  breakdown: Array<[license: string, count: number]>;
  /** Absolute output path, or undefined when written to stdout. */
  outputPath: string | undefined;
  outputLabel: string;
  bytes: number;
  elapsedMs: number;
}

export interface Reporter {
  banner(version: string): Promise<void>;
  step(label: string): Step;
  warn(message: string): void;
  /** Runs an interactive action with any animation paused. */
  suspend<T>(action: () => Promise<T>): Promise<T>;
  summary(data: SummaryData): void;
  error(error: unknown): void;
}

export interface WritableLike {
  write(chunk: string): unknown;
}

export interface ReporterOptions {
  quiet?: boolean;
  /** Pause between hero rows when animating (ms). */
  revealDelayMs?: number;
}

const FRAME_MS = 80;

export class ConsoleReporter implements Reporter {
  readonly style: Style;
  readonly symbols: Symbols;
  private readonly warnings: string[] = [];
  private active: AnimatedStep | undefined;

  constructor(
    private readonly out: WritableLike,
    private readonly env: UiEnv,
    private readonly options: ReporterOptions = {},
  ) {
    this.style = createStyle(env);
    this.symbols = getSymbols(env.unicode);
  }

  async banner(version: string): Promise<void> {
    if (this.options.quiet) {
      return;
    }
    const lines = this.env.hero
      ? renderBanner(this.style, { version, unicode: this.env.unicode, columns: this.env.columns })
      : [`${this.style.bold("third-party-notices")} ${this.style.dim(`v${version}`)}`];
    this.out.write("\n");
    for (const line of lines) {
      this.out.write(`  ${line}\n`);
      if (this.env.animate && lines.length > 1) {
        await sleep(this.options.revealDelayMs ?? 28);
      }
    }
    this.out.write("\n");
  }

  step(label: string): Step {
    if (this.options.quiet) {
      return { update() {}, succeed() {}, fail() {}, stop() {} };
    }
    const step = new AnimatedStep(this, label);
    this.active = step;
    step.begin();
    return step;
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  async suspend<T>(action: () => Promise<T>): Promise<T> {
    const step = this.active;
    step?.pause();
    try {
      return await action();
    } finally {
      step?.resume();
    }
  }

  summary(data: SummaryData): void {
    if (this.options.quiet) {
      return;
    }
    const { style, symbols } = this;
    const lines: string[] = [""];
    const target = data.outputPath
      ? style.link(pathToFileURL(data.outputPath).href, data.outputLabel)
      : data.outputLabel;
    lines.push(
      `  ${style.success(symbols.ok)} ${style.bold(`Wrote ${target}`)} ${style.dim(`${formatBytes(data.bytes)} ${symbols.bullet} ${formatDuration(data.elapsedMs)}`)}`,
    );
    lines.push("");
    lines.push(
      `  ${style.bold(String(data.packages))} packages ${style.dim(symbols.bullet)} ${style.bold(String(data.uniqueLicenses))} unique license texts`,
    );

    const top = data.breakdown.slice(0, 6);
    if (top.length > 0) {
      lines.push("");
      const nameWidth = Math.max(...top.map(([name]) => name.length));
      const max = Math.max(...top.map(([, count]) => count));
      const barWidth = Math.min(24, Math.max(8, this.env.columns - nameWidth - 14));
      for (const [name, count] of top) {
        const filled = Math.max(1, Math.round((count / max) * barWidth));
        const bar = symbols.bar.repeat(filled);
        lines.push(`  ${padEnd(name, nameWidth)}  ${style.cyan(bar)} ${style.dim(String(count))}`);
      }
      const hidden = data.breakdown.length - top.length;
      if (hidden > 0) {
        lines.push(`  ${style.dim(`${symbols.ellipsis} and ${hidden} more`)}`);
      }
    }

    if (this.warnings.length > 0) {
      lines.push("");
      for (const warning of this.warnings) {
        lines.push(`  ${style.yellow(symbols.warn)} ${warning}`);
      }
    }
    lines.push("");
    this.out.write(`${lines.join("\n")}\n`);
  }

  error(error: unknown): void {
    this.active?.stop();
    const { style } = this;
    if (error instanceof CliError) {
      this.out.write(`${style.bold(style.red("error:"))} ${indentContinuation(error.message)}\n`);
      if (error.hint) {
        this.out.write(`${style.bold(style.cyan("hint:"))}  ${error.hint}\n`);
      }
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.out.write(`${style.bold(style.red("error:"))} ${message}\n`);
    if (process.env.DEBUG?.includes("third-party-notices") && error instanceof Error && error.stack) {
      this.out.write(`${style.dim(error.stack)}\n`);
    }
  }

  /** @internal */
  get internals(): { out: WritableLike; env: UiEnv; clear: () => void } {
    return {
      out: this.out,
      env: this.env,
      clear: () => {
        this.active = undefined;
      },
    };
  }
}

class AnimatedStep implements Step {
  private detail = "";
  private timer: NodeJS.Timeout | undefined;
  private frame = 0;
  private done = false;
  private readonly startedAt = Date.now();
  private readonly exitHandler = (): void => {
    if (this.timer) {
      this.write(cursor.show);
    }
  };

  constructor(
    private readonly reporter: ConsoleReporter,
    private readonly label: string,
  ) {}

  begin(): void {
    const { env } = this.reporter.internals;
    if (env.animate) {
      this.write(cursor.hide);
      process.once("exit", this.exitHandler);
      this.render();
      this.timer = setInterval(() => this.render(), FRAME_MS);
      this.timer.unref();
    }
  }

  update(detail: string): void {
    this.detail = detail;
  }

  succeed(detail?: string): void {
    this.finish(this.reporter.style.success(this.reporter.symbols.ok), detail);
  }

  fail(detail?: string): void {
    this.finish(this.reporter.style.red(this.reporter.symbols.fail), detail);
  }

  stop(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.halt();
    this.reporter.internals.clear();
  }

  pause(): void {
    if (this.timer) {
      this.halt();
      this.write(cursor.clearLine);
    }
  }

  resume(): void {
    if (!this.done && this.reporter.internals.env.animate && !this.timer) {
      this.begin();
    }
  }

  private finish(marker: string, detail?: string): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.halt();
    const { style } = this.reporter;
    const text = detail ?? this.detail;
    const elapsed = style.dim(`(${formatDuration(Date.now() - this.startedAt)})`);
    const line = `${marker} ${this.label}${text ? ` ${style.dim(text)}` : ""} ${elapsed}`;
    this.write(`${this.reporter.internals.env.animate ? cursor.clearLine : ""}  ${line}\n`);
    this.reporter.internals.clear();
  }

  private halt(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.write(cursor.clearLine + cursor.show);
    }
    process.removeListener("exit", this.exitHandler);
  }

  private render(): void {
    const { style, symbols } = this.reporter;
    const { env } = this.reporter.internals;
    const glyph = symbols.spinner[this.frame++ % symbols.spinner.length] ?? "";
    const room = Math.max(10, env.columns - this.label.length - 8);
    const detail = this.detail ? ` ${style.dim(truncate(this.detail, room))}` : "";
    this.write(`${cursor.clearLine}  ${style.cyan(glyph)} ${this.label}${detail}`);
  }

  private write(text: string): void {
    this.reporter.internals.out.write(text);
  }
}

function indentContinuation(message: string): string {
  return message.split("\n").join("\n       ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
