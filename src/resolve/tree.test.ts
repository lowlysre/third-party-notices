import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CliError } from "../errors.js";
import { installPackage, link, tempDir, writeFiles } from "../testing/fixtures.js";
import { repositoryUrl, resolveDependencies } from "./tree.js";

describe("repositoryUrl", () => {
  it("normalizes npm repository forms to web URLs", () => {
    const expected = "https://github.com/acme/tool";
    for (const value of [
      "git+https://github.com/acme/tool.git",
      "git://github.com/acme/tool.git",
      "https://github.com/acme/tool",
      "git@github.com:acme/tool.git",
      "ssh://git@github.com/acme/tool.git",
      "github:acme/tool",
      "acme/tool",
      { type: "git", url: "git+https://github.com/acme/tool.git#main" },
    ]) {
      assert.equal(repositoryUrl(value), expected, JSON.stringify(value));
    }
    assert.equal(repositoryUrl("gitlab:acme/tool"), "https://gitlab.com/acme/tool");
    assert.equal(repositoryUrl("bitbucket:acme/tool"), "https://bitbucket.org/acme/tool");
  });

  it("returns undefined for unusable values", () => {
    for (const value of [undefined, null, 42, "", "  ", {}, { url: 5 }, "not a url", "file:../local"]) {
      assert.equal(repositoryUrl(value), undefined, JSON.stringify(value));
    }
  });
});

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

  it("captures license, homepage and author metadata", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { name: "app", dependencies: { a: "1", b: "1", c: "1", d: "1", e: "1" } },
    });
    await installPackage(root, "a", {
      license: "MIT",
      homepage: "https://a.example",
      author: "Ada <ada@x.y> (https://x.y)",
    });
    await installPackage(root, "b", { author: { name: "Bob" } });
    await installPackage(root, "c", { licenses: [{ type: "MIT" }, { type: "ISC" }, "BSD"] });
    await installPackage(root, "d", { license: { type: "Apache-2.0" }, author: 42 });
    await installPackage(root, "e", { licenses: [] });

    const { packages } = await resolveDependencies([join(root, "package.json")]);
    const byName = Object.fromEntries(packages.map((pkg) => [pkg.name, pkg]));
    assert.equal(byName.a?.license, "MIT");
    assert.equal(byName.a?.homepage, "https://a.example");
    assert.equal(byName.a?.author, "Ada");
    assert.equal(byName.b?.author, "Bob");
    assert.equal(byName.c?.license, "MIT OR ISC OR BSD");
    assert.equal(byName.d?.license, "Apache-2.0");
    assert.equal(byName.d?.author, undefined);
    assert.equal(byName.e?.license, undefined);
  });

  it("defaults missing name and version fields", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, {
      "package.json": { dependencies: { loose: "1" } },
      "node_modules/loose/package.json": {},
    });
    const { packages } = await resolveDependencies([root]);
    assert.deepEqual(names({ packages }), ["loose@0.0.0"]);
  });

  it("truncates long lists of missing dependencies", async (t) => {
    const root = await tempDir(t);
    const deps = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`gone${i}`, "1"]));
    await writeFiles(root, { "package.json": { name: "app", dependencies: deps } });
    await assert.rejects(
      resolveDependencies([join(root, "package.json")]),
      (error: unknown) =>
        error instanceof CliError &&
        /10 dependencies are not installed/.test(error.message) &&
        /and 2 more/.test(error.message),
    );
    await writeFiles(root, { "package.json": { name: "app", dependencies: { gone: "1" } } });
    await assert.rejects(resolveDependencies([join(root, "package.json")]), /1 dependency is not installed/);
  });

  it("does not list the input project when a dependency links back to it", async (t) => {
    const root = await tempDir(t);
    await writeFiles(root, { "package.json": { name: "app", version: "1.0.0", dependencies: { a: "1" } } });
    await installPackage(root, "a", { dependencies: { app: "1" } });
    await link(root, join(root, "node_modules", "app"));

    const result = await resolveDependencies([join(root, "package.json")]);
    assert.deepEqual(names(result), ["a@1.0.0"]);
    assert.deepEqual(result.firstParty, []);
  });

  it("explains when the input cannot be found", async (t) => {
    const root = await tempDir(t);
    await assert.rejects(resolveDependencies([join(root, "nope", "package.json")]), /Cannot find/);
  });
});
