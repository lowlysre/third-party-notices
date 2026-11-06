import { parseArgs } from "node:util";
import { didYouMean, UsageError } from "./errors.js";
import { CATEGORY_CHOICES, type Category, expandCategories } from "./policy.js";
import type { Style } from "./ui/ansi.js";
import { padEnd } from "./ui/ansi.js";

export interface Args {
  inputs: string[];
  output: string | undefined;
  config: string | undefined;
  overwrite: boolean;
  eol: "lf" | "crlf" | undefined;
  ci: boolean;
  failOn: Category[];
  noSpinner: boolean;
  omitVersions: boolean;
  noColor: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

interface OptionSpec {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
}

const OPTIONS = {
  input: { type: "string", short: "i", multiple: true },
  output: { type: "string", short: "o" },
  config: { type: "string", short: "c" },
  overwrite: { type: "boolean" },
  eol: { type: "string" },
  ci: { type: "boolean" },
  "fail-on": { type: "string", multiple: true },
  "no-spinner": { type: "boolean" },
  "omit-versions": { type: "boolean" },
  "no-color": { type: "boolean" },
  quiet: { type: "boolean", short: "q" },
  version: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
} as const satisfies Record<string, OptionSpec>;

/** Lets `-i a b c` take several paths, like variadic CLI options. */
export function expandVariadicInputs(argv: string[]): string[] {
  const out: string[] = [];
  let collecting = false;
  let collected = 0;
  const flush = (): void => {
    // A bare -i/--input with no values still needs to surface a "requires a value" error.
    if (collecting && collected === 0) {
      out.push("--input");
    }
    collecting = false;
    collected = 0;
  };
  for (const token of argv) {
    if (token === "-i" || token === "--input") {
      flush();
      collecting = true;
    } else if (collecting && !token.startsWith("-")) {
      out.push("--input", token);
      collected++;
    } else {
      flush();
      out.push(token);
    }
  }
  flush();
  return out;
}

function runParse(argv: string[]) {
  return parseArgs({
    args: expandVariadicInputs(argv),
    options: OPTIONS,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
}

export function parseCliArgs(argv: string[]): Args {
  const known = new Set(Object.keys(OPTIONS));
  const parsed = runParse(argv);

  for (const token of parsed.tokens ?? []) {
    if (token.kind === "option" && !known.has(token.name)) {
      const suggestion = didYouMean(token.name, [...known]);
      throw new UsageError(
        `Unknown option "${token.rawName}"`,
        suggestion ? `did you mean --${suggestion}?` : "run with --help to see all options",
      );
    }
    if (token.kind === "positional") {
      throw new UsageError(`Unexpected argument "${token.value}"`, "pass input files with --input <paths...>");
    }
  }

  const { values } = parsed;
  const typed = (key: keyof typeof OPTIONS, type: "string" | "boolean"): void => {
    const value = values[key];
    if (
      value !== undefined &&
      (type === "string" ? typeof value !== "string" && !Array.isArray(value) : typeof value !== "boolean")
    ) {
      throw new UsageError(`--${key} ${type === "string" ? "requires a value" : "does not take a value"}`);
    }
  };
  for (const [key, spec] of Object.entries(OPTIONS)) {
    typed(key as keyof typeof OPTIONS, spec.type);
  }

  const failOnValues = ((values["fail-on"] as string[] | undefined) ?? []).flatMap((value) => value.split(","));
  const failOn = expandCategories(failOnValues);
  if (failOn === undefined) {
    throw new UsageError("Invalid --fail-on value", `use one or more of: ${CATEGORY_CHOICES.join(", ")}`);
  }

  const eol = values.eol as string | undefined;
  if (eol !== undefined && eol !== "lf" && eol !== "crlf") {
    throw new UsageError(`Invalid --eol "${eol}"`, 'use "lf" or "crlf"');
  }

  return {
    inputs: (values.input as string[] | undefined) ?? [],
    output: values.output as string | undefined,
    config: values.config as string | undefined,
    overwrite: values.overwrite === true,
    eol: eol as Args["eol"],
    ci: values.ci === true,
    failOn,
    noSpinner: values["no-spinner"] === true,
    omitVersions: values["omit-versions"] === true,
    noColor: values["no-color"] === true,
    quiet: values.quiet === true,
    help: values.help === true,
    version: values.version === true,
  };
}

export function helpText(style: Style, columns: number): string {
  const options: Array<[flags: string, description: string]> = [
    ["-i, --input <paths...>", "package.json files to scan (default: ./package.json)"],
    ["-o, --output <path>", 'output file, or "-" for stdout (default: ./third-party-licenses.txt)'],
    ["-c, --config <path>", "config file (auto-detected when omitted)"],
    ["    --overwrite", "replace an existing output file without asking"],
    ["    --eol <lf|crlf>", "line endings of the output file (default: your OS)"],
    ["    --ci", "never prompt; exit 1 if user input would be needed"],
    ["    --fail-on <categories>", "exit 1 if a package falls in these license categories (copyleft, any, or a name)"],
    ["    --no-spinner", "disable the animated spinner"],
    ["    --omit-versions", 'list "pkg" instead of "pkg@1.2.3"'],
    ["    --no-color", "disable colors (also honors NO_COLOR)"],
    ["-q, --quiet", "print nothing except errors"],
    ["-v, --version", "print the version"],
    ["-h, --help", "show this help"],
  ];
  const width = Math.max(...options.map(([flags]) => flags.length));
  const wrapAt = Math.max(40, Math.min(columns, 100) - width - 6);

  const rows = options.map(([flags, description]) => {
    const [first = "", ...rest] = wrap(description, wrapAt);
    const lines = [`  ${style.cyan(padEnd(flags, width))}  ${first}`];
    for (const line of rest) {
      lines.push(`  ${" ".repeat(width)}  ${line}`);
    }
    return lines.join("\n");
  });

  const examples = [
    ["third-party-notices", "scan ./package.json, write third-party-licenses.txt"],
    ["tpn -i app/package.json lib/package.json -o NOTICE.txt", "several projects, one file"],
    ["tpn --ci --overwrite", "non-interactive, for pipelines"],
  ];
  const exampleWidth = Math.max(...examples.map(([cmd]) => (cmd as string).length));

  return [
    `${style.bold("Usage")}  third-party-notices ${style.dim("[options]")}   ${style.dim("(alias: tpn)")}`,
    "",
    style.bold("Options"),
    ...rows,
    "",
    style.bold("Examples"),
    ...examples.map(
      ([cmd, note]) => `  ${style.dim("$")} ${padEnd(cmd as string, exampleWidth)}  ${style.dim(note as string)}`,
    ),
    "",
    style.bold("Config"),
    `  ${style.dim('third-party-notices.config.json | .mjs, or a "thirdPartyNotices" key in package.json')}`,
    "",
  ].join("\n");
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
