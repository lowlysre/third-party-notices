import { readFileSync } from "node:fs";
import { parseCliArgs } from "./args.js";
import { CancelledError, CliError } from "./errors.js";
import { helpText } from "./help.js";
import { run } from "./run.js";
import { createStyle } from "./ui/ansi.js";
import { renderBanner } from "./ui/banner.js";
import { detectEnv, type StreamLike } from "./ui/env.js";
import type { PromptIO } from "./ui/prompt.js";
import { ConsoleReporter, type WritableLike } from "./ui/reporter.js";

export interface Io {
  stdout: WritableLike & StreamLike;
  stderr: WritableLike & StreamLike;
  stdin: NodeJS.ReadStream;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
}

export function readVersion(): string {
  const manifest = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

function helpScreen(io: Io, version: string, noColor: boolean): string {
  const env = detectEnv(io.stdout, io.env, { noColor });
  const style = createStyle(env);
  const hero = env.hero ? renderBanner(style, { version, unicode: env.unicode, columns: env.columns }) : [];
  const banner = hero.length > 0 ? `\n${hero.map((line) => `  ${line}`).join("\n")}\n\n` : "";
  return `${banner}${helpText(style, env.columns)}\n`;
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const version = readVersion();
  let reporter = new ConsoleReporter(io.stderr, detectEnv(io.stderr, io.env));

  try {
    const args = parseCliArgs(argv);
    if (args.version) {
      io.stdout.write(`${version}\n`);
      return 0;
    }
    if (args.help) {
      io.stdout.write(helpScreen(io, version, args.noColor));
      return 0;
    }

    const env = detectEnv(io.stderr, io.env, { noColor: args.noColor, noSpinner: args.noSpinner });
    reporter = new ConsoleReporter(io.stderr, env, { quiet: args.quiet, verbose: args.verbose });
    const { style, symbols } = reporter.term;
    const prompt: PromptIO | undefined =
      io.stdin.isTTY && env.hero ? { input: io.stdin, output: io.stderr, style, symbols } : undefined;

    await run(args, { cwd: io.cwd, version, reporter, stdout: io.stdout, prompt });
    return 0;
  } catch (error) {
    if (error instanceof CancelledError) {
      io.stderr.write(`\n${reporter.term.style.dim("Cancelled")}\n`);
      return 130;
    }
    reporter.error(error);
    return error instanceof CliError ? error.exitCode : 1;
  }
}
