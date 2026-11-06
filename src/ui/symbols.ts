export interface Symbols {
  ok: string;
  fail: string;
  warn: string;
  info: string;
  pointer: string;
  bullet: string;
  bar: string;
  spinner: readonly string[];
  ellipsis: string;
}

const UNICODE: Symbols = {
  ok: "✔",
  fail: "✖",
  warn: "▲",
  info: "ℹ",
  pointer: "❯",
  bullet: "·",
  bar: "█",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  ellipsis: "…",
};

const ASCII: Symbols = {
  ok: "√",
  fail: "x",
  warn: "!",
  info: "i",
  pointer: ">",
  bullet: "-",
  bar: "#",
  spinner: ["-", "\\", "|", "/"],
  ellipsis: "...",
};

// "√" is missing from some legacy code pages, so plain ASCII uses "v".
const PLAIN_ASCII: Symbols = { ...ASCII, ok: "v" };

export function getSymbols(unicode: boolean): Symbols {
  return unicode ? UNICODE : PLAIN_ASCII;
}
