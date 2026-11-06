import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CliError } from "../errors.js";
import { installPackage, link, tempDir, writeFiles } from "../testing/fixtures.js";
import { resolveDependencies } from "./tree.js";

const names = (result: { packages: Array<{ name: string; version: string }> }): string[] =>
  result.packages.map((pkg) => `${pkg.name}@${pkg.version}`);

describe("resolveDependencies", () => {
  it("walks hoisted production dependencies and ignores devDependencies", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1" }, devDependencies: { dev: "1" } },
    });
    await installPackage(root, "a", { dependencies: { b: "1" } });
    await installPackage(root, "b");
    await installPackage(root, "dev");

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["a@1.0.0", "b@1.0.0"]);
  });

  it("lists nested duplicates at different versions separately", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1", c: "1" } } });
    await installPackage(root, "a", { dependencies: { shared: "1" } });
    await installPackage(root, "c", { dependencies: { shared: "2" } });
    await installPackage(root, "shared", { version: "1.0.0" });
    await installPackage(join(root, "node_modules", "c"), "shared", { version: "2.0.0" });

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["a@1.0.0", "c@1.0.0", "shared@1.0.0", "shared@2.0.0"]);
  });

  it("supports scoped packages and cycles", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { "@s/x": "1" } } });
    await installPackage(root, "@s/x", { dependencies: { y: "1" } });
    await installPackage(root, "y", { dependencies: { "@s/x": "1" } });

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["@s/x@1.0.0", "y@1.0.0"]);
  });

  it("skips missing optional dependencies but reports missing required ones", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1" }, optionalDependencies: { fsevents: "1" } },
    });
    await installPackage(root, "a", { dependencies: { gone: "1" }, optionalDependencies: { native: "1" } });

    await assert.rejects(
      resolveDependencies([join(root, "package.json")]),
      (error: unknown) =>
        error instanceof CliError &&
        /gone \(required by a@1\.0\.0\)/.test(error.message) &&
        !/native/.test(error.message),
    );
  });

  it("includes installed peer dependencies of dependencies only", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1" }, peerDependencies: { p: "1" } } });
    await installPackage(root, "a", { peerDependencies: { host: "1" } });
    await installPackage(root, "host");
    await installPackage(root, "p");

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["a@1.0.0", "host@1.0.0"]);
  });

  it("excludes linked workspace packages but still walks their dependencies", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { "ws-lib": "1" } },
      "packages/ws-lib/package.json": { name: "ws-lib", version: "1.0.0", dependencies: { dep: "1" } },
    });
    await link(join(root, "packages", "ws-lib"), join(root, "node_modules", "ws-lib"));
    await installPackage(root, "dep");

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["dep@1.0.0"]);
    assert.deepEqual(result.firstParty, ["ws-lib@1.0.0"]);
  });

  it("deduplicates packages reached through symlinks (pnpm layout)", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1", b: "1" } } });
    const store = join(root, "node_modules", ".pnpm");
    await installPackage(join(store, "shared@1"), "shared");
    await installPackage(join(store, "a@1"), "a", { dependencies: { shared: "1" } });
    await installPackage(join(store, "b@1"), "b", { dependencies: { shared: "1" } });
    await link(join(store, "shared@1", "node_modules", "shared"), join(store, "a@1", "node_modules", "shared"));
    await link(join(store, "shared@1", "node_modules", "shared"), join(store, "b@1", "node_modules", "shared"));
    await link(join(store, "a@1", "node_modules", "a"), join(root, "node_modules", "a"));
    await link(join(store, "b@1", "node_modules", "b"), join(root, "node_modules", "b"));

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["a@1.0.0", "b@1.0.0", "shared@1.0.0"]);
  });

  it("merges several inputs", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "one/package.json": { name: "one", dependencies: { a: "1" } },
      "two/package.json": { name: "two", dependencies: { b: "1" } },
    });
    await installPackage(root, "a");
    await installPackage(root, "b");

    const result = await resolveDependencies([join(root, "one"), join(root, "two", "package.json")]);
    assert.deepEqual(names(result), ["a@1.0.0", "b@1.0.0"]);
  });

  it("explains when the input cannot be found", async (t) => {
    const root = await tempDir(t);
    await assert.rejects(resolveDependencies([join(root, "nope", "package.json")]), /Cannot find/);
  });
});
