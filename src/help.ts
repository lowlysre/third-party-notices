import { OPTIONS } from "./args.js";
import { padEnd, type Style } from "./ui/ansi.js";

const EXAMPLES: ReadonlyArray<readonly [command: string, note: string]> = [
  ["third-party-notices", "scan ./package.json, write third-party-licenses.txt"],
  ["tpn -i app/package.json lib/package.json -o NOTICE.txt", "several projects, one file"],
  ["tpn --ci --overwrite", "non-interactive, for pipelines"],
];

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
  return line ? [...lines, line] : lines;
}

/** The `--help` text, generated from the option table. */
export function helpText(style: Style, columns: number): string {
  const flags = OPTIONS.map(({ name, short, value }) => {
    const names = short ? `-${short}, --${name}` : `    --${name}`;
    return value ? `${names} ${value}` : names;
  });
  const flagWidth = Math.max(...flags.map((flag) => flag.length));
  const wrapAt = Math.max(20, Math.min(columns, 100) - flagWidth - 6);

  const options = OPTIONS.flatMap(({ description }, index) => {
    const [first = "", ...rest] = wrap(description, wrapAt);
    return [
      `  ${style.cyan(padEnd(flags[index] ?? "", flagWidth))}  ${first}`,
      ...rest.map((line) => `  ${" ".repeat(flagWidth)}  ${line}`),
    ];
  });

  // An example whose note doesn't fit beside its command moves the note to its own line.
  const commandWidth = Math.max(...EXAMPLES.map(([command]) => command.length));
  const examples = EXAMPLES.flatMap(([command, note]) =>
    commandWidth + note.length + 6 <= columns
      ? [`  ${style.dim("$")} ${padEnd(command, commandWidth)}  ${style.dim(note)}`]
      : [`  ${style.dim("$")} ${command}`, `    ${style.dim(note)}`],
  );
  const config = wrap(
    'third-party-notices.config.json | .mjs, or a "thirdPartyNotices" key in package.json',
    columns - 4,
  );

  return [
    `${style.bold("Usage")}  third-party-notices ${style.dim("[options]")}   ${style.dim("(alias: tpn)")}`,
    "",
    style.bold("Options"),
    ...options,
    "",
    style.bold("Examples"),
    ...examples,
    "",
    style.bold("Config"),
    ...config.map((line) => `  ${style.dim(line)}`),
    "",
  ].join("\n");
}
