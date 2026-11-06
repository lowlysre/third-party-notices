import { relative } from "node:path";
import type { Args } from "./args.js";
import { loadConfig } from "./config.js";
import { groupLicenses, licenseBreakdown } from "./core/group.js";
import { missingFileNote, packageLabel, policyError, unresolvedError } from "./core/messages.js";
import { matchesAny } from "./core/patterns.js";
import { reviewPackages } from "./core/policy.js";
import { renderDocument } from "./core/render.js";
import { resolveSettings, type Settings } from "./core/settings.js";
import { generateLicense } from "./core/templates.js";
import type { LicenseChoice, LicensedPackage, ResolvedPackage } from "./core/types.js";
import { CliError } from "./errors.js";
import { pathExists, readExisting } from "./fs.js";
import { systemLineEnding, writeFileAtomic } from "./output.js";
import { mapPool } from "./pool.js";
import { licenseFor } from "./resolve/license.js";
import { resolveDependencies } from "./resolve/tree.js";
import { askForLicense } from "./ui/license-prompt.js";
import { confirm, type PromptIO } from "./ui/prompt.js";
import type { Reporter, Step, WritableLike } from "./ui/reporter.js";

export interface RunDeps {
  cwd: string;
  version: string;
  reporter: Reporter;
  stdout: WritableLike;
  /** Present only when both stdin and stderr are interactive. */
  prompt: PromptIO | undefined;
}

const READ_CONCURRENCY = 16;

/** Runs a reporter step, marking it failed if the work throws. */
async function withStep<T>(reporter: Reporter, label: string, work: (step: Step) => Promise<T>): Promise<T> {
  const step = reporter.step(label);
  try {
    return await work(step);
  } catch (error) {
    step.fail();
    throw error;
  }
}

/** Refuses to replace an existing output unless allowed, asking first when a terminal is available. */
async function guardOverwrite(settings: Settings, prompt: PromptIO | undefined, cwd: string): Promise<void> {
  if (settings.output === "-" || settings.overwrite || !(await pathExists(settings.output))) return;
  const shown = relative(cwd, settings.output) || settings.output;
  if (!prompt) throw new CliError(`${shown} already exists`, { hint: "pass --overwrite to replace it" });
  if (!(await confirm(prompt, `${shown} already exists. Overwrite?`))) {
    throw new CliError("Aborted: output file left untouched");
  }
}

async function findPackages(settings: Settings, step: Step): Promise<ResolvedPackage[]> {
  const { packages } = await resolveDependencies(settings.inputs);
  const kept = packages.filter((pkg) => !matchesAny(settings.exclude, pkg.name, pkg.version));
  const excluded = packages.length - kept.length;
  step.succeed(`${kept.length} packages${excluded > 0 ? `, ${excluded} excluded` : ""}`);
  return kept;
}

async function readLicenses(packages: readonly ResolvedPackage[], settings: Settings, step: Step) {
  let done = 0;
  const infos = await mapPool(packages, READ_CONCURRENCY, async (pkg) => {
    const info = await licenseFor(pkg, settings.replace);
    step.update(`${++done}/${packages.length}  ${pkg.name}`);
    return info;
  });
  const licensed: LicensedPackage[] = [];
  const unresolved: ResolvedPackage[] = [];
  for (const [index, { text, notices }] of infos.entries()) {
    const pkg = packages[index] as ResolvedPackage;
    if (text === undefined) unresolved.push(pkg);
    else licensed.push({ name: pkg.name, version: pkg.version, text, notices });
  }
  step.succeed(unresolved.length > 0 ? `${unresolved.length} need attention` : `${packages.length} read`);
  return { licensed, unresolved };
}

/** A template when the declared license has one, else nothing (the package is skipped). */
function templateFallback(pkg: ResolvedPackage): LicenseChoice {
  const text = generateLicense(pkg.license, pkg.author);
  return text ? { text, generated: true } : undefined;
}

/** Fills in packages with no license text: automatically with `allowMissing`, by prompting on a terminal, else fails. */
async function fillMissing(
  unresolved: readonly ResolvedPackage[],
  settings: Settings,
  prompt: PromptIO | undefined,
  reporter: Reporter,
): Promise<LicensedPackage[]> {
  if (unresolved.length === 0) return [];
  const decide = settings.allowMissing
    ? async (pkg: ResolvedPackage) => templateFallback(pkg)
    : prompt && ((pkg: ResolvedPackage) => reporter.suspend(() => askForLicense(prompt, pkg)));
  if (!decide) throw unresolvedError(unresolved);

  const licensed: LicensedPackage[] = [];
  for (const pkg of unresolved) {
    const choice = await decide(pkg);
    if (!choice) {
      reporter.warn(`Skipped ${packageLabel(pkg)}: no license text`);
    } else {
      licensed.push({ name: pkg.name, version: pkg.version, text: choice.text, notices: [] });
      if (choice.generated) {
        reporter.warn(`${packageLabel(pkg)}: license text generated from an SPDX template, please review`);
      }
    }
    reporter.note(`${packageLabel(pkg)} ${missingFileNote(pkg)}`);
  }
  return licensed;
}

/** Finds the dependencies, collects their license texts, writes the notice file and prints a summary. */
export async function run(args: Args, deps: RunDeps): Promise<void> {
  const startedAt = Date.now();
  const { cwd, reporter, stdout } = deps;
  await reporter.banner(deps.version);

  const settings = resolveSettings(args, await loadConfig(cwd, args.config), cwd, systemLineEnding());
  const prompt = args.ci ? undefined : deps.prompt;
  await guardOverwrite(settings, prompt, cwd);

  const packages = await withStep(reporter, "Resolving dependencies", (step) => findPackages(settings, step));
  const { licensed, unresolved } = await withStep(reporter, "Reading licenses", (step) =>
    readLicenses(packages, settings, step),
  );
  licensed.push(...(await fillMissing(unresolved, settings, prompt, reporter)));

  const { document, groups } = await withStep(reporter, "Writing notices", async (step) => {
    const appended = await Promise.all(settings.append.map((file) => readExisting(file, "Appended file")));
    const groups = groupLicenses(licensed, settings.omitVersions);
    const document = renderDocument({ groups, appended, lineEnding: settings.lineEnding });
    if (settings.output === "-") stdout.write(document);
    else await writeFileAtomic(settings.output, document);
    step.succeed(`${groups.length} unique licenses`);
    return { document, groups };
  });

  const findings = reviewPackages(packages, settings.allow);
  const toStdout = settings.output === "-";
  reporter.summary({
    packages: licensed.length,
    uniqueLicenses: groups.length,
    breakdown: licenseBreakdown(packages),
    outputPath: toStdout ? undefined : settings.output,
    outputLabel: toStdout ? "stdout" : relative(cwd, settings.output) || settings.output,
    bytes: Buffer.byteLength(document),
    elapsedMs: Date.now() - startedAt,
    findings,
  });

  const failing = findings.filter((finding) => settings.blocked.has(finding.category));
  if (failing.length > 0) throw policyError(failing);
}
