import { parseArgs } from "node:util";
import { CATEGORY_CHOICES, type Category, expandCategories } from "./core/policy.js";
import { didYouMean } from "./core/suggest.js";
import type { LineEnding } from "./core/types.js";
import { UsageError } from "./errors.js";

export interface OptionDef {
  name: string;
  short?: string;
  type: "string" | "boolean";
  /** May be given more than once. */
  multiple?: boolean;
  /** Placeholder shown in help, such as `<path>`. */
  value?: string;
  description: string;
}

/** The single source of truth for both parsing and `--help`. */
export const OPTIONS: readonly OptionDef[] = [
  {
    name: "input",
    short: "i",
    type: "string",
    multiple: true,
    value: "<paths...>",
    description: "package.json files to scan (default: ./package.json)",
  },
  {
    name: "output",
    short: "o",
    type: "string",
    value: "<path>",
    description: 'output file, or "-" for stdout (default: ./third-party-licenses.txt)',
  },
  {
    name: "config",
    short: "c",
    type: "string",
    value: "<path>",
    description: "config file (auto-detected when omitted)",
  },
  { name: "overwrite", type: "boolean", description: "replace an existing output file without asking" },
  {
    name: "eol",
    type: "string",
    value: "<lf|crlf>",
    description: "line endings of the output file (default: your OS)",
  },
  { name: "ci", type: "boolean", description: "never prompt; exit 1 if user input would be needed" },
  {
    name: "allow-missing",
    type: "boolean",
    description: "don't prompt or fail for packages with no license text: use an SPDX template or skip",
  },
  {
    name: "fail-on",
    type: "string",
    multiple: true,
    value: "<categories>",
    description: "exit 1 if a package falls in these license categories (copyleft, any, or a name)",
  },
  { name: "no-spinner", type: "boolean", description: "disable the animated spinner" },
  { name: "omit-versions", type: "boolean", description: 'list "pkg" instead of "pkg@1.2.3"' },
  { name: "no-color", type: "boolean", description: "disable colors (also honors NO_COLOR)" },
  { name: "quiet", short: "q", type: "boolean", description: "print nothing except errors" },
  { name: "verbose", type: "boolean", description: "show extra notes, such as packages that ship no license file" },
  { name: "version", short: "v", type: "boolean", description: "print the version" },
  { name: "help", short: "h", type: "boolean", description: "show this help" },
];

export interface Args {
  inputs: string[];
  output: string | undefined;
  config: string | undefined;
  overwrite: boolean;
  allowMissing: boolean;
  eol: LineEnding | undefined;
  ci: boolean;
  failOn: Category[];
  noSpinner: boolean;
  omitVersions: boolean;
  noColor: boolean;
  quiet: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
}

/** Lets `-i a b c` take several paths, as variadic options do in other CLIs. */
export function expandVariadicInputs(argv: readonly string[]): string[] {
  const out: string[] = [];
  let collecting = false;
  let valueSeen = false;
  const endCollecting = () => {
    // A bare `-i` still reaches the parser so it can report the missing value.
    if (collecting && !valueSeen) out.push("--input");
    collecting = valueSeen = false;
  };
  for (const token of argv) {
    if (token === "-i" || token === "--input") {
      endCollecting();
      collecting = true;
    } else if (collecting && !token.startsWith("-")) {
      out.push("--input", token);
      valueSeen = true;
    } else {
      endCollecting();
      out.push(token);
    }
  }
  endCollecting();
  return out;
}

/** Parses the command line, throwing a `UsageError` for anything unrecognized or malformed. */
export function parseCliArgs(argv: readonly string[]): Args {
  const known = OPTIONS.map((option) => option.name);
  const { values, tokens } = parseArgs({
    args: expandVariadicInputs(argv),
    options: Object.fromEntries(
      OPTIONS.map(({ name, short, type, multiple }) => [
        name,
        { type, ...(short && { short }), ...(multiple && { multiple }) },
      ]),
    ),
    allowPositionals: true,
    strict: false,
    tokens: true,
  });

  for (const token of tokens) {
    if (token.kind === "positional") {
      throw new UsageError(`Unexpected argument "${token.value}"`, "pass input files with --input <paths...>");
    }
    if (token.kind !== "option") continue;
    if (!known.includes(token.name)) {
      const suggestion = didYouMean(token.name, known);
      throw new UsageError(
        `Unknown option "${token.rawName}"`,
        suggestion ? `did you mean --${suggestion}?` : "run with --help to see all options",
      );
    }
    // A separate value that looks like an option means the real value is missing: `-o --ci`.
    const wantsValue = OPTIONS.some((option) => option.name === token.name && option.type === "string");
    if (wantsValue && token.inlineValue === false && token.value?.startsWith("-") && token.value !== "-") {
      throw new UsageError(
        `--${token.name} requires a value`,
        `use --${token.name}=${token.value} to pass it literally`,
      );
    }
  }

  for (const { name, type } of OPTIONS) {
    const value = values[name];
    if (value !== undefined && [value].flat().some((item) => typeof item !== type)) {
      throw new UsageError(`--${name} ${type === "string" ? "requires a value" : "does not take a value"}`);
    }
  }

  const text = (name: string) => values[name] as string | undefined;
  const flag = (name: string) => values[name] === true;

  const failOn = expandCategories(
    ((values["fail-on"] as string[] | undefined) ?? []).flatMap((value) => value.split(",")),
  );
  if (!failOn) {
    throw new UsageError("Invalid --fail-on value", `use one or more of: ${CATEGORY_CHOICES.join(", ")}`);
  }
  const eol = text("eol");
  if (eol !== undefined && eol !== "lf" && eol !== "crlf") {
    throw new UsageError(`Invalid --eol "${eol}"`, 'use "lf" or "crlf"');
  }

  return {
    inputs: (values.input as string[] | undefined) ?? [],
    output: text("output"),
    config: text("config"),
    overwrite: flag("overwrite"),
    allowMissing: flag("allow-missing"),
    eol,
    ci: flag("ci"),
    failOn,
    noSpinner: flag("no-spinner"),
    omitVersions: flag("omit-versions"),
    noColor: flag("no-color"),
    quiet: flag("quiet"),
    verbose: flag("verbose"),
    help: flag("help"),
    version: flag("version"),
  };
}
