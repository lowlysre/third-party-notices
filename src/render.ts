import { EOL } from "node:os";
import { type LicenseGroup, normalizeEol } from "./group.js";

export type LineEnding = "lf" | "crlf";

export const SEPARATOR = "-----------";

const HEADER =
  "This file was generated with the third-party-notices npm package!\nhttps://www.npmjs.com/package/third-party-notices";

export function defaultLineEnding(): LineEnding {
  return EOL === "\r\n" ? "crlf" : "lf";
}

export interface RenderInput {
  groups: LicenseGroup[];
  appended: string[];
  lineEnding: LineEnding;
}

/** Produces the notice document. Format mirrors generate-license-file's. */
export function renderDocument({ groups, appended, lineEnding }: RenderInput): string {
  const sections = [...groups.map(formatGroup), ...appended.map((text) => normalizeEol(text).trim())];
  const body = [HEADER, ...joinSections(sections), HEADER].join("\n\n");
  const text = `${body}\n`;
  return lineEnding === "crlf" ? text.replace(/\n/g, "\r\n") : text;
}

function joinSections(sections: string[]): string[] {
  return sections.flatMap((section) => [section, SEPARATOR]);
}

function formatGroup(group: LicenseGroup): string {
  const single = group.dependencies.length === 1;
  const prefix = single
    ? "The following npm package may be included in this product:"
    : "The following npm packages may be included in this product:";
  const midfix = single
    ? "This package contains the following license:"
    : "These packages each contain the following license:";
  const list = group.dependencies.map((dep) => ` - ${dep}`).join("\n");
  let text = `${prefix}\n\n${list}\n\n${midfix}\n\n${group.text}`;
  if (group.notices.length > 0) {
    text += `\n\nWith the following notices:\n\n${group.notices.join("\n")}`;
  }
  return text;
}
