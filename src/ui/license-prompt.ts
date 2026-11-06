import { resolve } from "node:path";
import { contactUrl, packageLabel } from "../core/messages.js";
import { renderTemplate, templateIdFor } from "../core/templates.js";
import type { LicenseChoice, ResolvedPackage } from "../core/types.js";
import { readText } from "../fs.js";
import { type PromptIO, readLine, readMultiline, select } from "./prompt.js";

type Choice = "file" | "paste" | "template" | "skip";

/** Asks what to do about a package with no license text: a file, pasted text, a template, or skip. */
export async function askForLicense(io: PromptIO, pkg: ResolvedPackage): Promise<LicenseChoice> {
  const { style, symbols, output } = io;
  const complain = (message: string) => output.write(`${style.red(symbols.fail)} ${message}\n`);

  output.write(`\n${style.yellow(symbols.warn)} ${style.bold(`No license text found for ${packageLabel(pkg)}`)}\n`);
  const details = [pkg.license ? `declares ${pkg.license}` : "no license field", contactUrl(pkg)].filter(Boolean);
  output.write(`  ${style.dim(details.join(` ${symbols.bullet} `))}\n\n`);

  const templateId = templateIdFor(pkg.license);
  const choices: Array<{ label: string; value: Choice; hint?: string }> = [
    { label: "Provide a file path", value: "file" },
    { label: "Paste the license text", value: "paste" },
    ...(templateId
      ? [
          {
            label: `Use the ${templateId} template`,
            value: "template" as const,
            hint: "copyright line from package author",
          },
        ]
      : []),
    { label: "Skip this package", value: "skip" },
  ];

  for (;;) {
    const choice = await select(io, "How should this be handled?", choices, { escape: "skip" });
    if (choice === "skip") return undefined;
    if (choice === "template" && templateId) return { text: renderTemplate(templateId, pkg.author), generated: true };

    if (choice === "paste") {
      const text = (await readMultiline(io, "Paste the license text")).trim();
      if (text) return { text, generated: false };
      complain("Nothing was entered");
      continue;
    }

    const path = await readLine(io, "Path to license file:");
    const text = await readText(resolve(path)).then(
      (content) => content.trim(),
      () => undefined,
    );
    if (text) return { text, generated: false };
    complain(text === undefined ? `Could not read ${path}` : "That file is empty");
  }
}
