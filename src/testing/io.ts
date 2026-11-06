import { PassThrough } from "node:stream";
import { createStyle } from "../ui/ansi.js";
import type { PromptIO } from "../ui/prompt.js";
import { getSymbols } from "../ui/symbols.js";

export interface Capture {
  out: { write(chunk: string): void };
  text: () => string;
}

export function capture(): Capture {
  let buffer = "";
  return {
    out: {
      write(chunk: string): void {
        buffer += chunk;
      },
    },
    text: () => buffer,
  };
}

export interface FakeTty {
  input: PassThrough & { isTTY: boolean };
  rawModes: boolean[];
}

/** A PassThrough that looks enough like a TTY for prompts. */
export function fakeTtyInput(): FakeTty {
  const input = new PassThrough();
  const rawModes: boolean[] = [];
  Object.assign(input, { isTTY: true, setRawMode: (mode: boolean) => rawModes.push(mode) });
  return { input: input as FakeTty["input"], rawModes };
}

export function fakeIo(): { io: PromptIO; input: PassThrough; output: () => string; rawModes: boolean[] } {
  const { input, rawModes } = fakeTtyInput();
  const sink = capture();
  const io = {
    input: input as unknown as PromptIO["input"],
    output: sink.out,
    style: createStyle({ color: false }),
    symbols: getSymbols(true),
  };
  return { io, input, output: sink.text, rawModes };
}

/**
 * Plays keystrokes into a prompt: each step waits until the output written since the
 * previous step matches, then sends its input. Keeps scripted prompts deterministic.
 */
export async function script(
  input: PassThrough,
  output: () => string,
  steps: Array<[expect: RegExp, send: string]>,
): Promise<void> {
  let offset = 0;
  for (const [expect, send] of steps) {
    const deadline = Date.now() + 3000;
    let match = expect.exec(output().slice(offset));
    while (!match) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${expect}; saw: ${output().slice(offset)}`);
      }
      await new Promise((resolve) => setImmediate(resolve));
      match = expect.exec(output().slice(offset));
    }
    offset += match.index + match[0].length;
    input.write(send);
  }
}
