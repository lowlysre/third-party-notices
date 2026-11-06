import { createInterface, emitKeypressEvents, type Key } from "node:readline";
import { CancelledError } from "../errors.js";
import { cursor, type Style } from "./ansi.js";
import type { Symbols } from "./symbols.js";

export interface PromptInput {
  setRawMode?: (mode: boolean) => unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
}

export interface PromptIO {
  input: PromptInput & NodeJS.ReadableStream;
  output: { write(chunk: string): unknown };
  style: Style;
  symbols: Symbols;
}

export interface Choice<T> {
  label: string;
  value: T;
  hint?: string;
}

export interface SelectOptions<T> {
  /** Value returned when the user presses Escape. */
  escape?: T;
}

/** Arrow-key list picker. Ctrl-C rejects with CancelledError. */
export function select<T>(
  io: PromptIO,
  message: string,
  choices: Array<Choice<T>>,
  options: SelectOptions<T> = {},
): Promise<T> {
  const { input, output, style, symbols } = io;
  return new Promise<T>((resolve, reject) => {
    let index = 0;
    let rendered = 0;

    const draw = (): void => {
      const lines = [
        `${style.cyan("?")} ${style.bold(message)}`,
        ...choices.map((choice, i) => {
          const selected = i === index;
          const pointer = selected ? style.cyan(symbols.pointer) : " ";
          const label = selected ? style.cyan(choice.label) : choice.label;
          const hint = choice.hint ? ` ${style.dim(choice.hint)}` : "";
          return `  ${pointer} ${label}${hint}`;
        }),
      ];
      output.write(`${cursor.up(rendered)}${cursor.clearDown}${lines.join("\n")}\n`);
      rendered = lines.length;
    };

    const finish = (done: () => void, summary?: string): void => {
      input.removeListener("keypress", onKey);
      input.setRawMode?.(false);
      input.pause();
      output.write(cursor.up(rendered) + cursor.clearDown + cursor.show);
      if (summary) {
        output.write(`${style.success(symbols.ok)} ${message} ${style.cyan(summary)}\n`);
      }
      done();
    };

    const onKey = (text: string | undefined, key: Key | undefined): void => {
      const name = key?.name;
      if (key?.ctrl && name === "c") {
        finish(() => reject(new CancelledError()));
      } else if (name === "up" || name === "k") {
        index = (index + choices.length - 1) % choices.length;
        draw();
      } else if (name === "down" || name === "j" || name === "tab") {
        index = (index + 1) % choices.length;
        draw();
      } else if (name === "return" || name === "enter") {
        const choice = choices[index] as Choice<T>;
        finish(() => resolve(choice.value), choice.label);
      } else if (name === "escape" && "escape" in options) {
        finish(() => resolve(options.escape as T));
      } else if (text && /^[1-9]$/.test(text) && Number(text) <= choices.length) {
        index = Number(text) - 1;
        draw();
      }
    };

    emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();
    output.write(cursor.hide);
    input.on("keypress", onKey);
    draw();
  });
}

export async function confirm(io: PromptIO, message: string): Promise<boolean> {
  return select(
    io,
    message,
    [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
    { escape: false },
  );
}

/** Reads one line. */
export function readLine(io: PromptIO, message: string): Promise<string> {
  return readLines(io, `${io.style.cyan("?")} ${io.style.bold(message)} `, true);
}

/** Reads lines until a line containing only "." (pasted licenses can hold blank lines). */
export async function readMultiline(io: PromptIO, message: string): Promise<string> {
  io.output.write(
    `${io.style.cyan("?")} ${io.style.bold(message)} ${io.style.dim('(finish with a line containing only ".")')}\n`,
  );
  return readLines(io, "", false);
}

function readLines(io: PromptIO, prompt: string, single: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: io.input, terminal: false });
    const lines: string[] = [];
    let settled = false;
    const settle = (action: () => void): void => {
      if (!settled) {
        settled = true;
        rl.close();
        action();
      }
    };
    io.output.write(prompt);
    rl.on("line", (line) => {
      if (single) {
        settle(() => resolve(line.trim()));
      } else if (line.trim() === ".") {
        settle(() => resolve(lines.join("\n")));
      } else {
        lines.push(line);
      }
    });
    rl.on("close", () => settle(() => reject(new CancelledError())));
    rl.on("SIGINT", () => settle(() => reject(new CancelledError())));
  });
}
