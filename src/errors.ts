/** An expected failure: reported as `error:` plus an optional `hint:`, without a stack trace. */
export class CliError extends Error {
  readonly hint: string | undefined;
  readonly exitCode: number;

  constructor(message: string, options: { hint?: string; exitCode?: number } = {}) {
    super(message);
    this.name = "CliError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

/** Bad command line. Exit code 2. */
export class UsageError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { hint, exitCode: 2 });
    this.name = "UsageError";
  }
}

/** The user cancelled a prompt. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}
