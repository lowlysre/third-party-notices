# third-party-notices

[![CI](https://github.com/lowlysre/third-party-notices/actions/workflows/ci.yml/badge.svg)](https://github.com/lowlysre/third-party-notices/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/third-party-notices?logo=npm)](https://www.npmjs.com/package/third-party-notices)
[![npm downloads](https://img.shields.io/npm/dm/third-party-notices?logo=npm)](https://www.npmjs.com/package/third-party-notices)
[![license: ISC](https://img.shields.io/npm/l/third-party-notices)](LICENSE)
[![sustainable-npm](https://img.shields.io/badge/sustainable--npm-🌱-blue?style=flat)](https://github.com/lowlydba/sustainable-npm)

Zero-dependency CLI that generates a third-party license notice file for the production dependencies of npm projects.

Example run on a terminal:

```text
████████╗██████╗ ███╗   ██╗
╚══██╔══╝██╔══██╗████╗  ██║   third-party-notices v0.1.0
   ██║   ██████╔╝██╔██╗ ██║   A tiny license notice CLI
   ██║   ██╔═══╝ ██║╚██╗██║   for your npm dependencies.
   ██║   ██║     ██║ ╚████║
   ╚═╝   ╚═╝     ╚═╝  ╚═══╝

  ✔ Resolving dependencies 214 packages (45ms)
  ✔ Reading licenses 214 read (31ms)
  ✔ Writing notices 31 unique licenses (6ms)

  ✔ Wrote third-party-licenses.txt 412 KB · 96ms

  214 packages · 31 unique license texts

  MIT         ████████████████████████ 160
  ISC         ██████ 38
  Apache-2.0  ███ 16
```

## Why notices matter

MIT, ISC, and the BSD licenses all ask for the same thing: if you distribute the software, include its copyright notice and license text. Apache-2.0 also requires carrying along any NOTICE file. A web app or container image with a few hundred npm packages in it owes a few hundred of those texts, and almost nobody wants to collect them by hand.

Notices are also how maintainers get credited for work they gave away. This tool makes producing the notice one command, cheap enough to run on every release, so it stays current as your dependencies change. This isn't legal advice, so read the terms of the licenses you depend on.

## Highlights

- No dependencies of its own. Installing it adds one package, so there's nothing extra to audit or update.
- Finds licenses the way GitHub does. It follows Node's resolution through hoisted, nested, pnpm, and workspace layouts, reads `LICENSE`, `COPYING`, `NOTICE`, `LICENSES/`, and the rest of Licensee's conventions, and lists packages that share a text once.
- Flags copyleft, restricted-use, and unclear licenses in the summary, and `--fail-on` makes them a CI gate. Packages with no license file can be prompted for, templated, or skipped.
- A terminal UI with a banner, spinner, and license chart. Output is plain in CI, and `-o -` writes the document alone to stdout.

## Usage

Run it from a project that has its dependencies installed.

```bash
npx third-party-notices
npx third-party-notices -i app/package.json lib/package.json -o NOTICE.txt
```

The short alias `tpn` is installed alongside `third-party-notices`. The options you'll use most:

| Option | Description |
| --- | --- |
| `-i, --input <paths...>` | `package.json` files to scan. Default: `./package.json` |
| `-o, --output <path>` | Output file, or `-` for stdout. Default: `./third-party-licenses.txt` |
| `--ci` | Never prompt. Exit 1 if a license text is missing |
| `--allow-missing` | Use a template or skip packages with no license text instead of failing |
| `--fail-on <categories>` | Exit 1 if a package falls in these [license review](docs/how-it-works.md#license-review) categories |

Run `tpn --help` for the rest, or see the [command line reference](docs/cli.md) for every option, exit code, and environment variable.

## Docs

- [Command line reference](docs/cli.md): every option, exit code, and environment variable.
- [Configuration](docs/configuration.md): config files and keys.
- [How it works](docs/how-it-works.md): dependency resolution, license file detection, and the output format.
- [Development](docs/development.md): building, testing, CI, and releases.

## Acknowledgments

This project stands on two others, and it would not exist without them.

- [generate-license-file](https://github.com/TobyAndToby/generate-license-file) by Toby Bessant and Toby Smith (ISC). It defined the problem and the shape of the solution: the command line options, the config keys, and the output document layout all follow its design. It's the tool to reach for if you want a library API or need YAML and JSON5 configs. No code from it is included here.
- [Licensee](https://github.com/licensee/licensee) by Ben Balter and contributors (MIT). It's the library behind GitHub's license detection. The license file name rules in `src/resolve/names.ts` are a TypeScript port of its file name scoring, so the files GitHub recognizes as a license are the files found here. That part is derived from its code, which is why its MIT notice is in [NOTICE](NOTICE).

Thank you to both teams.
