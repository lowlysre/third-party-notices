import { createStyle, type Style } from "./ansi.js";
import type { UiEnv } from "./env.js";
import { getSymbols, type Symbols } from "./symbols.js";

export interface WritableLike {
  write(chunk: string): unknown;
}

/** Everything needed to draw to a terminal: where to write and how to style it. */
export interface Terminal {
  out: WritableLike;
  env: UiEnv;
  style: Style;
  symbols: Symbols;
}

export const createTerminal = (out: WritableLike, env: UiEnv): Terminal => ({
  out,
  env,
  style: createStyle(env),
  symbols: getSymbols(env.unicode),
});
