import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CliError } from "../errors.js";
import { installPackage, link, tempDir, writeFiles } from "../testing/fixtures.js";
import { resolveDependencies } from "./tree.js";

const labels = (result: { packages: Array<{ name: string; version: string }> }) =>
  result.packages.map((pkg) => `${pkg.name}@${pkg.version}`);
const resolveApp = (root: string) => resolveDependencies([join(root, "package.json")]);

describe("resolveDependencies", () => {
  it("walks hoisted production dependencies and ignores devDependencies", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1" }, devDependencies: { dev: "1" } },
    });
    await installPackage(root, "a", { dependencies: { b: "1" } });
    await installPackage(root, "b");
    await installPackage(root, "dev");
    assert.deepEqual(labels(await resolveApp(root)), ["a@1.0.0", "b@1.0.0"]);
  });

  it("lists nested duplicates at different versions separately", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1", c: "1" } } });
    await installPackage(root, "a", { dependencies: { shared: "1" } });
    await installPackage(root, "c", { dependencies: { shared: "2" } });
    await installPackage(root, "shared", { version: "1.0.0" });
    await installPackage(join(root, "node_modules", "c"), "shared", { version: "2.0.0" });
    assert.deepEqual(labels(await resolveApp(root)), ["a@1.0.0", "c@1.0.0", "shared@1.0.0", "shared@2.0.0"]);
  });

  it("supports scoped packages and cycles", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { "@s/x": "1" } } });
    await installPackage(root, "@s/x", { dependencies: { y: "1" } });
    await installPackage(root, "y", { dependencies: { "@s/x": "1" } });
    assert.deepEqual(labels(await resolveApp(root)), ["@s/x@1.0.0", "y@1.0.0"]);
  });

  it("skips missing optional dependencies but reports every missing required one", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1" }, optionalDependencies: { fsevents: "1" } },
    });
    await installPackage(root, "a", { dependencies: { gone: "1" }, optionalDependencies: { native: "1" } });
    await assert.rejects(
      resolveApp(root),
      (error: unknown) =>
        error instanceof CliError &&
        /gone \(required by a@1\.0\.0\)/.test(error.message) &&
        !/native|fsevents/.test(error.message),
    );
  });

  it("lets an optional declaration override a required one of the same name", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { native: "1" }, optionalDependencies: { native: "1" } },
    });
    assert.deepEqual(labels(await resolveApp(root)), []);
  });

  it("includes installed peers of dependencies, but not the input's own peers", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1" }, peerDependencies: { p: "1" } } });
    await installPackage(root, "a", { peerDependencies: { host: "1" } });
    await installPackage(root, "host");
    await installPackage(root, "p");
    assert.deepEqual(labels(await resolveApp(root)), ["a@1.0.0", "host@1.0.0"]);
  });

  it("excludes linked workspace packages but still walks their dependencies", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { "ws-lib": "1" } },
      "packages/ws-lib/package.json": { name: "ws-lib", version: "1.0.0", dependencies: { dep: "1" } },
    });
    await link(join(root, "packages", "ws-lib"), join(root, "node_modules", "ws-lib"));
    await installPackage(root, "dep");
    const result = await resolveApp(root);
    assert.deepEqual(labels(result), ["dep@1.0.0"]);
    assert.deepEqual(result.firstParty, ["ws-lib@1.0.0"]);
  });

  it("does not list the input project when a dependency links back to it", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", version: "1.0.0", dependencies: { a: "1" } } });
    await installPackage(root, "a", { dependencies: { app: "1" } });
    await link(root, join(root, "node_modules", "app"));
    const result = await resolveApp(root);
    assert.deepEqual([labels(result), result.firstParty], [["a@1.0.0"], []]);
  });

  it("deduplicates packages reached through symlinks (pnpm layout)", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1", b: "1" } } });
    const store = join(root, "node_modules", ".pnpm");
    await installPackage(join(store, "shared@1"), "shared");
    for (const name of ["a", "b"]) {
      await installPackage(join(store, `${name}@1`), name, { dependencies: { shared: "1" } });
      await link(join(store, "shared@1", "node_modules", "shared"), join(store, `${name}@1`, "node_modules", "shared"));
      await link(join(store, `${name}@1`, "node_modules", name), join(root, "node_modules", name));
    }
    assert.deepEqual(labels(await resolveApp(root)), ["a@1.0.0", "b@1.0.0", "shared@1.0.0"]);
  });

  it("merges several inputs, given as files or directories", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "one/package.json": { name: "one", dependencies: { a: "1" } },
      "two/package.json": { name: "two", dependencies: { b: "1" } },
    });
    await installPackage(root, "a");
    await installPackage(root, "b");
    assert.deepEqual(labels(await resolveDependencies([join(root, "one"), join(root, "two", "package.json")])), [
      "a@1.0.0",
      "b@1.0.0",
    ]);
  });

  it("captures license, homepage, repository and author", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", dependencies: { a: "1" } } });
    await installPackage(root, "a", {
      license: "MIT",
      homepage: "https://a.example",
      repository: "github:acme/a",
      author: "Ada <ada@x.y>",
    });
    const [pkg] = (await resolveApp(root)).packages;
    assert.deepEqual(
      [pkg?.license, pkg?.homepage, pkg?.repository, pkg?.author],
      ["MIT", "https://a.example", "https://github.com/acme/a", "Ada"],
    );
  });

  it("explains when the input cannot be found", async (t) => {
    const root = await tempDir(t);
    await assert.rejects(resolveDependencies([join(root, "nope", "package.json")]), /Cannot find/);
  });
});
