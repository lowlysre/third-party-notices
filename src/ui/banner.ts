import type { Style } from "./ansi.js";
import { visibleLength } from "./ansi.js";

const UNICODE_ART = [
  "████████╗██████╗ ███╗   ██╗",
  "╚══██╔══╝██╔══██╗████╗  ██║",
  "   ██║   ██████╔╝██╔██╗ ██║",
  "   ██║   ██╔═══╝ ██║╚██╗██║",
  "   ██║   ██║     ██║ ╚████║",
  "   ╚═╝   ╚═╝     ╚═╝  ╚═══╝",
];

const ASCII_ART = [
  " _____ ____  _   _ ",
  "|_   _|  _ \\| \\ | |",
  "  | | | |_) |  \\| |",
  "  | | |  __/| |\\  |",
  "  |_| |_|   |_| \\_|",
];

export interface BannerOptions {
  version: string;
  unicode: boolean;
  columns: number;
}

/** Minimum width for the full hero; narrower terminals get a one-line title. */
const MIN_HERO_COLUMNS = 64;

export function renderBanner(style: Style, options: BannerOptions): string[] {
  const title = `${style.bold(style.cyan("third-party-notices"))} ${style.dim(`v${options.version}`)}`;
  if (options.columns < MIN_HERO_COLUMNS) {
    return [title];
  }

  const art = options.unicode ? UNICODE_ART : ASCII_ART;
  const gradient = [style.cyan, style.cyan, style.blue, style.blue, style.magenta, style.magenta];
  const artWidth = Math.max(...art.map((line) => line.length));

  const side = [
    "",
    title,
    style.dim("License notices for your npm dependencies,"),
    style.dim("generated in seconds. Zero dependencies."),
    "",
    "",
  ];
  return art.map((line, index) => {
    const paint = gradient[index] ?? style.magenta;
    const text = side[index] ?? "";
    const padding = " ".repeat(artWidth - visibleLength(line) + 3);
    return `${style.bold(paint(line))}${text ? padding + text : ""}`;
  });
}
