// Verifies the npm tarball ships only what it should and declares no runtime dependencies.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// npm_execpath points at npm's JS entry point, which avoids needing a shell on Windows.
const npmCli = process.env.npm_execpath;
const raw = npmCli
  ? execFileSync(process.execPath, [npmCli, "pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" })
  : execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
const [report] = JSON.parse(raw);
const files = report.files.map((file) => file.path.replaceAll("\\", "/"));

const failures = [];
for (const key of ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies"]) {
  if (pkg[key] && Object.keys(pkg[key]).length > 0) {
    failures.push(`package.json must not declare ${key}`);
  }
}
for (const bin of Object.values(pkg.bin)) {
  if (!files.includes(bin)) failures.push(`missing bin target ${bin}`);
}
const allowed = (file) =>
  file === "package.json" ||
  file === "LICENSE" ||
  file === "README.md" ||
  (file.startsWith("dist/") && !file.endsWith(".test.js") && !file.startsWith("dist/testing/"));
for (const file of files) {
  if (!allowed(file)) failures.push(`unexpected file in tarball: ${file}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`pack ok: ${files.length} files, no runtime dependencies`);
