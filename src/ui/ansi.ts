const ESC = "\u001b";
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

export const cursor = {
  hide: `${ESC}[?25l`,
  show: `${ESC}[?25h`,
  clearLine: `\r${ESC}[2K`,
  up: (n: number): string => (n > 0 ? `${ESC}[${n}A` : ""),
  clearDown: `${ESC}[0J`,
};

export type Painter = (text: string) => string;

export interface Style {
  bold: Painter;
  dim: Painter;
  red: Painter;
  green: Painter;
  yellow: Painter;
  blue: Painter;
  magenta: Painter;
  cyan: Painter;
  gray: Painter;
  link: (url: string, text: string) => string;
}

export function createStyle(options: { color: boolean; hyperlinks?: boolean }): Style {
  const wrap =
    (open: number, close: number): Painter =>
    (text) =>
      options.color ? `${ESC}[${open}m${text}${ESC}[${close}m` : text;
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    magenta: wrap(35, 39),
    cyan: wrap(36, 39),
    gray: wrap(90, 39),
    link: (url, text) => (options.hyperlinks ? `${ESC}]8;;${url}${ESC}\\${text}${ESC}]8;;${ESC}\\` : text),
  };
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function visibleLength(text: string): number {
  return [...stripAnsi(text)].length;
}

/** Truncates plain text to a maximum number of columns, adding an ellipsis. */
export function truncate(text: string, max: number, ellipsis = "…"): string {
  const chars = [...text];
  if (chars.length <= max) {
    return text;
  }
  return max <= ellipsis.length
    ? chars.slice(0, Math.max(0, max)).join("")
    : chars.slice(0, max - ellipsis.length).join("") + ellipsis;
}

export function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}
