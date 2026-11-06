import { renderBanner } from "./banner.js";
import type { UiEnv } from "./env.js";
import { renderError, renderSummary, type SummaryData } from "./format.js";
import { AnimatedStep, NO_STEP, type Step } from "./step.js";
import { createTerminal, type Terminal, type WritableLike } from "./terminal.js";

export type { Step, SummaryData, WritableLike };

/** What the pipeline reports through, so it never touches the terminal itself. */
export interface Reporter {
  banner(version: string): Promise<void>;
  step(label: string): Step;
  warn(message: string): void;
  /** Extra detail, shown in the summary only with `--verbose`. */
  note(message: string): void;
  /** Runs an interactive action with any animation paused. */
  suspend<T>(action: () => Promise<T>): Promise<T>;
  summary(data: SummaryData): void;
  error(error: unknown): void;
}

export interface ReporterOptions {
  quiet?: boolean;
  verbose?: boolean;
  /** Delay between hero banner rows when animating. */
  revealDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ConsoleReporter implements Reporter {
  readonly term: Terminal;
  private readonly warnings: string[] = [];
  private readonly notes: string[] = [];
  private active: AnimatedStep | undefined;

  constructor(
    out: WritableLike,
    env: UiEnv,
    private readonly options: ReporterOptions = {},
  ) {
    this.term = createTerminal(out, env);
  }

  async banner(version: string): Promise<void> {
    if (this.options.quiet) return;
    const { out, env, style } = this.term;
    const lines = env.hero
      ? renderBanner(style, { version, unicode: env.unicode, columns: env.columns })
      : [`${style.bold("third-party-notices")} ${style.dim(`v${version}`)}`];
    out.write("\n");
    for (const line of lines) {
      out.write(`  ${line}\n`);
      if (env.animate && lines.length > 1) await sleep(this.options.revealDelayMs ?? 28);
    }
    out.write("\n");
  }

  step(label: string): Step {
    if (this.options.quiet) return NO_STEP;
    const step = new AnimatedStep(this.term, label, () => {
      if (this.active === step) this.active = undefined;
    });
    this.active = step;
    return step;
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  note(message: string): void {
    if (this.options.verbose) this.notes.push(message);
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
    if (this.options.quiet) return;
    this.term.out.write(renderSummary(this.term, data, { warnings: this.warnings, notes: this.notes }));
  }

  error(error: unknown): void {
    this.active?.stop();
    const debug = process.env.DEBUG?.includes("third-party-notices") ?? false;
    this.term.out.write(renderError(error, this.term.style, debug));
  }
}
