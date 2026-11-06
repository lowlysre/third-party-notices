import { relative, resolve } from "node:path";
import type { Args } from "./args.js";
import { type Config, loadConfig, matchesPackage } from "./config.js";
import { CliError } from "./errors.js";
import { pathExists, readText } from "./fs.js";
import { groupLicenses, type LicensedPackage } from "./group.js";
import { writeFileAtomic } from "./output.js";
import { defaultLineEnding, renderDocument } from "./render.js";
import { readLicense } from "./resolve/license.js";
import { renderTemplate, templateIdFor } from "./resolve/templates.js";
import { type ResolvedPackage, resolveDependencies } from "./resolve/tree.js";
import { confirm, type PromptIO, readLine, readMultiline, select } from "./ui/prompt.js";
import type { Reporter, WritableLike } from "./ui/reporter.js";

export interface RunDeps {
  cwd: string;
  version: string;
  reporter: Reporter;
  stdout: WritableLike;
  /** Present only when stdin/stderr are interactive. */
  prompt: PromptIO | undefined;
}

const CONCURRENCY = 16;

export async function run(args: Args, deps: RunDeps): Promise<void> {
  const startedAt = Date.now();
  const { cwd, reporter } = deps;
  await reporter.banner(deps.version);

  const { config } = await loadConfig(cwd, args.config);

  const inputs =
    args.inputs.length > 0
      ? args.inputs.map((p) => resolve(cwd, p))
      : (config.inputs ?? [resolve(cwd, "package.json")]);
  const output = args.output
    ? args.output === "-"
      ? "-"
      : resolve(cwd, args.output)
    : (config.output ?? resolve(cwd, "third-party-licenses.txt"));
  const lineEnding = args.eol ?? config.lineEnding ?? defaultLineEnding();
  const omitVersions = args.omitVersions || config.omitVersions === true;
  const overwrite = args.overwrite || config.overwrite === true;
  const prompt = args.ci ? undefined : deps.prompt;

  if (output !== "-" && !overwrite && (await pathExists(output))) {
    const shown = relative(cwd, output) || output;
    if (!prompt) {
      throw new CliError(`${shown} already exists`, { hint: "pass --overwrite to replace it" });
    }
    if (!(await confirm(prompt, `${shown} already exists. Overwrite?`))) {
      throw new CliError("Aborted: output file left untouched", { exitCode: 1 });
    }
  }

  const resolving = reporter.step("Resolving dependencies");
  let packages: ResolvedPackage[];
  try {
    const result = await resolveDependencies(inputs);
    packages = result.packages.filter(
      (pkg) => !config.exclude.some((pattern) => matchesPackage(pattern, pkg.name, pkg.version)),
    );
    const excluded = result.packages.length - packages.length;
    resolving.succeed(`${packages.length} packages${excluded > 0 ? `, ${excluded} excluded` : ""}`);
  } catch (error) {
    resolving.fail();
    throw error;
  }

  const reading = reporter.step("Reading licenses");
  const licensed: LicensedPackage[] = [];
  const unresolved: ResolvedPackage[] = [];
  const generated: string[] = [];
  try {
    let done = 0;
    const found = await mapPool(packages, CONCURRENCY, async (pkg) => {
      const info = await readLicenseFor(pkg, config);
      reading.update(`${++done}/${packages.length}  ${pkg.name}`);
      return info;
    });
    for (const [index, info] of found.entries()) {
      const pkg = packages[index] as ResolvedPackage;
      if (info.text === undefined) {
        unresolved.push(pkg);
      } else {
        licensed.push({ name: pkg.name, version: pkg.version, text: info.text, notices: info.notices });
      }
    }
    reading.succeed(unresolved.length > 0 ? `${unresolved.length} need attention` : `${packages.length} read`);
  } catch (error) {
    reading.fail();
    throw error;
  }

  if (unresolved.length > 0) {
    if (!prompt) {
      throw unresolvedError(unresolved);
    }
    for (const pkg of unresolved) {
      const answer = await reporter.suspend(() => askForLicense(prompt, pkg));
      if (answer === undefined) {
        reporter.warn(`Skipped ${pkg.name}@${pkg.version}: no license text`);
      } else {
        licensed.push({ name: pkg.name, version: pkg.version, text: answer.text, notices: [] });
        if (answer.generated) generated.push(`${pkg.name}@${pkg.version}`);
      }
    }
  }
  for (const label of generated) {
    reporter.warn(`${label}: license text generated from an SPDX template, please review`);
  }

  const rendering = reporter.step("Writing notices");
  let document: string;
  try {
    const appended = await Promise.all(config.append.map((file) => readAppendix(file)));
    const groups = groupLicenses(licensed, omitVersions);
    document = renderDocument({ groups, appended, lineEnding });
    if (output === "-") {
      deps.stdout.write(document);
    } else {
      await writeFileAtomic(output, document);
    }
    rendering.succeed(`${groups.length} unique licenses`);

    reporter.summary({
      packages: licensed.length,
      uniqueLicenses: groups.length,
      breakdown: breakdown(packages),
      outputPath: output === "-" ? undefined : output,
      outputLabel: output === "-" ? "stdout" : relative(cwd, output) || output,
      bytes: Buffer.byteLength(document),
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    rendering.fail();
    throw error;
  }
}

async function readLicenseFor(
  pkg: ResolvedPackage,
  config: Config,
): Promise<{ text: string | undefined; notices: string[] }> {
  const replacement = config.replace[`${pkg.name}@${pkg.version}`] ?? config.replace[pkg.name];
  if (replacement !== undefined) {
    if (!(await pathExists(replacement))) {
      throw new CliError(`Replacement license for ${pkg.name} not found: ${replacement}`);
    }
    return { text: await readText(replacement), notices: [] };
  }
  return readLicense(pkg);
}

async function readAppendix(file: string): Promise<string> {
  if (!(await pathExists(file))) {
    throw new CliError(`Appended file not found: ${file}`);
  }
  return readText(file);
}

function unresolvedError(unresolved: ResolvedPackage[]): CliError {
  const shown = unresolved
    .slice(0, 10)
    .map((pkg) => `  - ${pkg.name}@${pkg.version}${pkg.license ? ` (declares ${pkg.license})` : ""}`);
  const more = unresolved.length > shown.length ? [`  …and ${unresolved.length - shown.length} more`] : [];
  return new CliError(
    `No license text found for ${unresolved.length} package${unresolved.length === 1 ? "" : "s"}:\n${[...shown, ...more].join("\n")}`,
    {
      hint: 'supply the text with "replace" in the config file, exclude the package, or run without --ci to be prompted',
    },
  );
}

type Answer = { text: string; generated: boolean } | undefined;

async function askForLicense(io: PromptIO, pkg: ResolvedPackage): Promise<Answer> {
  const { style, symbols, output } = io;
  output.write(
    `\n${style.yellow(symbols.warn)} ${style.bold(`No license text found for ${pkg.name}@${pkg.version}`)}\n`,
  );
  const details = [pkg.license ? `declares ${pkg.license}` : "no license field", pkg.homepage]
    .filter(Boolean)
    .join(` ${symbols.bullet} `);
  output.write(`  ${style.dim(details)}\n\n`);

  const templateId = templateIdFor(pkg.license);
  for (;;) {
    const choice = await select<"file" | "paste" | "template" | "skip">(
      io,
      "How should this be handled?",
      [
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
      ],
      { escape: "skip" },
    );
    if (choice === "skip") return undefined;
    if (choice === "template" && templateId) {
      return { text: renderTemplate(templateId, pkg.author), generated: true };
    }
    if (choice === "paste") {
      const text = (await readMultiline(io, "Paste the license text")).trim();
      if (text) return { text, generated: false };
      output.write(`${style.red(symbols.fail)} Nothing was entered\n`);
      continue;
    }
    const path = await readLine(io, "Path to license file:");
    try {
      const text = (await readText(resolve(path))).trim();
      if (text) return { text, generated: false };
      output.write(`${style.red(symbols.fail)} That file is empty\n`);
    } catch {
      output.write(`${style.red(symbols.fail)} Could not read ${path}\n`);
    }
  }
}

function breakdown(packages: ResolvedPackage[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const pkg of packages) {
    const key = pkg.license ?? "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(lanes);
  return results;
}
