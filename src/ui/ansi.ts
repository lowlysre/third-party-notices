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
  /** Bold bright green, for success marks. */
  success: Painter;
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
    success: (text) => (options.color ? `${ESC}[1m${ESC}[92m${text}${ESC}[39m${ESC}[22m` : text),
    link: (url, text) => (options.hyperlinks ? `${ESC}]8;;${url}${ESC}\\${text}${ESC}]8;;${ESC}\\` : text),
  };
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

/** Columns a character occupies: 0 for combining marks, 2 for East Asian wide and fullwidth forms and emoji, else 1. */
const WIDE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]/u;
const charWidth = (char: string): number => (/\p{M}/u.test(char) ? 0 : WIDE.test(char) ? 2 : 1);

/** Terminal columns taken by plain text. */
export const textWidth = (text: string): number => [...text].reduce((sum, char) => sum + charWidth(char), 0);

export function visibleLength(text: string): number {
  return textWidth(stripAnsi(text));
}

/** Truncates plain text to a maximum number of terminal columns, adding an ellipsis. */
export function truncate(text: string, max: number, ellipsis = "…"): string {
  if (textWidth(text) <= max) {
    return text;
  }
  const room = max <= textWidth(ellipsis) ? Math.max(0, max) : max - textWidth(ellipsis);
  let kept = "";
  let used = 0;
  for (const char of text) {
    used += charWidth(char);
    if (used > room) break;
    kept += char;
  }
  return max <= textWidth(ellipsis) ? kept : kept + ellipsis;
}

export function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}
