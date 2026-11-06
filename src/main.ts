import { readFileSync } from "node:fs";
import { helpText, parseCliArgs } from "./args.js";
import { CancelledError, CliError } from "./errors.js";
import { run } from "./run.js";
import { createStyle } from "./ui/ansi.js";
import { renderBanner } from "./ui/banner.js";
import { detectEnv, type StreamLike } from "./ui/env.js";
import type { PromptIO } from "./ui/prompt.js";
import { ConsoleReporter, type WritableLike } from "./ui/reporter.js";
import { getSymbols } from "./ui/symbols.js";

export interface Io {
  stdout: WritableLike & StreamLike;
  stderr: WritableLike & StreamLike;
  stdin: NodeJS.ReadStream;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
}

export function readVersion(): string {
  const url = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { version: string }).version;
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const version = readVersion();
  const errorEnv = detectEnv(io.stderr, io.env);
  let reporter = new ConsoleReporter(io.stderr, errorEnv);

  try {
    const args = parseCliArgs(argv);

    if (args.version) {
      io.stdout.write(`${version}\n`);
      return 0;
    }

    if (args.help) {
      const outEnv = detectEnv(io.stdout, io.env, { noColor: args.noColor });
      const style = createStyle(outEnv);
      const hero = outEnv.hero
        ? renderBanner(style, { version, unicode: outEnv.unicode, columns: outEnv.columns })
        : [];
      io.stdout.write(
        `${hero.length > 0 ? `\n${hero.map((line) => `  ${line}`).join("\n")}\n\n` : ""}${helpText(style, outEnv.columns)}\n`,
      );
      return 0;
    }

    const env = detectEnv(io.stderr, io.env, { noColor: args.noColor, noSpinner: args.noSpinner });
    reporter = new ConsoleReporter(io.stderr, env, { quiet: args.quiet, verbose: args.verbose });

    const interactive = io.stdin.isTTY === true && env.hero;
    const prompt: PromptIO | undefined = interactive
      ? { input: io.stdin, output: io.stderr, style: reporter.style, symbols: getSymbols(env.unicode) }
      : undefined;

    await run(args, { cwd: io.cwd, version, reporter, stdout: io.stdout, prompt });
    return 0;
  } catch (error) {
    if (error instanceof CancelledError) {
      io.stderr.write(`\n${reporter.style.dim("Cancelled")}\n`);
      return 130;
    }
    reporter.error(error);
    return error instanceof CliError ? error.exitCode : 1;
  }
}
