import { type LicenseGroup, normalizeEol } from "./group.js";
import type { LineEnding } from "./types.js";

const SEPARATOR = "-----------";
const HEADER =
  "This file was generated with the third-party-notices npm package!\nhttps://www.npmjs.com/package/third-party-notices";

export interface RenderInput {
  groups: readonly LicenseGroup[];
  /** Extra text placed after the last group. */
  appended: readonly string[];
  lineEnding: LineEnding;
}

function renderGroup({ dependencies, text, notices }: LicenseGroup): string {
  const single = dependencies.length === 1;
  const intro = `The following npm package${single ? "" : "s"} may be included in this product:`;
  const lead = single
    ? "This package contains the following license:"
    : "These packages each contain the following license:";
  const list = dependencies.map((dependency) => ` - ${dependency}`).join("\n");
  const noticeText = notices.length > 0 ? `\n\nWith the following notices:\n\n${notices.join("\n")}` : "";
  return `${intro}\n\n${list}\n\n${lead}\n\n${text}${noticeText}`;
}

/** The notice document: a header, then each section split by a separator line. */
export function renderDocument({ groups, appended, lineEnding }: RenderInput): string {
  const sections = [...groups.map(renderGroup), ...appended.map((text) => normalizeEol(text).trim())];
  if (sections.length === 0) return "";
  const body = [HEADER, sections.join(`\n\n${SEPARATOR}\n\n`)].join("\n\n");
  return lineEnding === "crlf" ? `${body}\n`.replace(/\n/g, "\r\n") : `${body}\n`;
}
