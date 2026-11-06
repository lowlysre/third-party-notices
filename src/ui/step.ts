import { cursor, truncate } from "./ansi.js";
import { formatDuration } from "./format.js";
import type { Terminal } from "./terminal.js";

/** One line of progress: an animated spinner on a TTY, a single result line otherwise. */
export interface Step {
  update(detail: string): void;
  succeed(detail?: string): void;
  fail(detail?: string): void;
  /** Stops animating and clears the line without printing a result. */
  stop(): void;
}

export const NO_STEP: Step = { update() {}, succeed() {}, fail() {}, stop() {} };

const FRAME_MS = 80;

export class AnimatedStep implements Step {
  private detail = "";
  private frame = 0;
  private timer: NodeJS.Timeout | undefined;
  private done = false;
  private readonly startedAt = Date.now();
  // Safety net: never leave the cursor hidden if the process ends mid-step.
  private readonly restoreCursor = () => this.timer && this.write(cursor.show);
  // Node's default SIGINT/SIGTERM handling skips the "exit" event, so exit explicitly.
  private readonly onSignal = (signal: NodeJS.Signals) => process.exit(signal === "SIGINT" ? 130 : 143);

  constructor(
    private readonly term: Terminal,
    private readonly label: string,
    private readonly onEnd: () => void,
  ) {
    this.start();
  }

  update(detail: string): void {
    this.detail = detail;
  }

  succeed(detail?: string): void {
    this.finish(this.term.style.success(this.term.symbols.ok), detail);
  }

  fail(detail?: string): void {
    this.finish(this.term.style.red(this.term.symbols.fail), detail);
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    this.halt();
    this.onEnd();
  }

  /** Stops drawing while something else (a prompt) uses the terminal. */
  pause(): void {
    if (!this.timer) return;
    this.halt();
    this.write(cursor.clearLine);
  }

  resume(): void {
    if (!this.done && !this.timer) this.start();
  }

  private start(): void {
    if (!this.term.env.animate) return;
    this.write(cursor.hide);
    process.once("exit", this.restoreCursor);
    process.once("SIGINT", this.onSignal);
    process.once("SIGTERM", this.onSignal);
    this.draw();
    this.timer = setInterval(() => this.draw(), FRAME_MS);
    this.timer.unref();
  }

  private halt(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.write(cursor.clearLine + cursor.show);
    }
    process.removeListener("exit", this.restoreCursor);
    process.removeListener("SIGINT", this.onSignal);
    process.removeListener("SIGTERM", this.onSignal);
  }

  private finish(marker: string, detail?: string): void {
    if (this.done) return;
    this.done = true;
    this.halt();
    const { style } = this.term;
    const text = detail ?? this.detail;
    const elapsed = style.dim(`(${formatDuration(Date.now() - this.startedAt)})`);
    const line = `${marker} ${this.label}${text ? ` ${style.dim(text)}` : ""} ${elapsed}`;
    this.write(`${this.term.env.animate ? cursor.clearLine : ""}  ${line}\n`);
    this.onEnd();
  }

  private draw(): void {
    const { style, symbols, env } = this.term;
    const glyph = symbols.spinner[this.frame++ % symbols.spinner.length] ?? "";
    const room = env.columns - this.label.length - 6;
    const detail = this.detail && room > 1 ? ` ${style.dim(truncate(this.detail, room, symbols.ellipsis))}` : "";
    this.write(`${cursor.clearLine}  ${style.cyan(glyph)} ${this.label}${detail}`);
  }

  private write(text: string): void {
    this.term.out.write(text);
  }
}
