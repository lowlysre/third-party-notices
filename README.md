# third-party-notices

[![CI](https://github.com/lowlysre/third-party-notices/actions/workflows/ci.yml/badge.svg)](https://github.com/lowlysre/third-party-notices/actions/workflows/ci.yml)
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

It reads the installed `node_modules`, collects each package's license text, groups packages that share identical text, and writes one file. The feature set follows [generate-license-file](https://github.com/TobyAndToby/generate-license-file), as a CLI only.

> [!NOTE]
> The package isn't published to npm yet. Until it is, build from source (see Development).

## Usage

Run it from a project that has its dependencies installed.

```bash
npx third-party-notices
npx third-party-notices -i app/package.json lib/package.json -o NOTICE.txt
```

The short alias `tpn` is installed alongside `third-party-notices`.

| Option | Description |
| --- | --- |
| `-i, --input <paths...>` | `package.json` files (or directories containing one) to scan. Default: `./package.json` |
| `-o, --output <path>` | Output file. `-` writes the document to stdout. Default: `./third-party-licenses.txt` |
| `-c, --config <path>` | Config file. Auto-detected when omitted |
| `--overwrite` | Replace an existing output file without asking |
| `--eol <lf\|crlf>` | Line endings of the output. Default: the OS default |
| `--ci` | Never prompt. Exit 1 if a license text is missing |
| `--no-spinner` | Disable the animated spinner |
| `--omit-versions` | List `name` instead of `name@version` |
| `--no-color` | Disable colors |
| `-q, --quiet` | Print only errors |
| `-v, --version` | Print the version |
| `-h, --help` | Show help |

Precedence is command line, then config file, then defaults.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime failure, or `--ci` found a package without license text |
| `2` | Usage error (unknown option, bad value) |
| `130` | Cancelled with Ctrl-C |

## Output

The document lists each group of packages followed by their shared license text, with `NOTICE` files appended under "With the following notices:". Groups and packages are sorted, so the same input produces the same bytes on every OS for a given `--eol`.

```text
The following npm packages may be included in this product:

 - a@1.0.0
 - b@1.0.0

These packages each contain the following license:

MIT License ...

-----------
```

## Configuration

The config is read from the first of these that exists in the working directory:

1. `--config <path>`
2. `third-party-notices.config.json`
3. `third-party-notices.config.mjs` (default export: an object, or a function returning one)
4. A `thirdPartyNotices` key in `package.json`

```json
{
  "inputs": ["./package.json"],
  "output": "./third-party-licenses.txt",
  "lineEnding": "lf",
  "omitVersions": false,
  "overwrite": false,
  "append": ["./additional-content.txt"],
  "replace": {
    "some-package@4.33.1": "./bespoke-license.txt",
    "another-package": "./bespoke-license-2.txt"
  },
  "exclude": ["your-package", "my-package@1.2.0", "/^@types\\//"]
}
```

- `append`: file contents added after the last license group.
- `replace`: use the given file instead of the package's license. Keys are `name` or `name@version`.
- `exclude`: omit packages. Entries are `name`, `name@version`, or a `/regex/flags` matched against the name.
- Relative paths resolve against the directory of the config file.
- Unknown keys and wrong types are errors, listed together with their key path.

## How dependencies are resolved

For each input `package.json`, the tool walks `dependencies` and `optionalDependencies` using Node's resolution algorithm against the installed `node_modules`, so hoisted, nested, scoped, and pnpm layouts resolve the same way Node would.

- `devDependencies` are never walked.
- Peer dependencies of a dependency are included when installed. Peer dependencies of the input itself are not walked.
- Packages are deduplicated by real path, which handles symlinks and cycles. The same package at two versions appears twice.
- Packages found outside `node_modules` (workspace members and `link:` or `file:` dependencies) are treated as first-party code: they aren't listed, but their own dependencies are.
- A missing required dependency fails the run and lists every missing package. A missing optional dependency is skipped.

## License text

For each package, the first match wins:

1. A `replace` entry from the config.
2. License files in the package root, named by the conventions GitHub recognizes: `LICENSE`, `LICENCE`, `UNLICENSE`, `COPYING`, `COPYRIGHT`, `OFL`, and `PATENTS`, with extensions and decorations such as `LICENSE-MIT`, `MIT-LICENSE`, or `COPYING.LESSER`. Files in a `licenses/` directory are included too. Code, data, and image files with those names (`license.js`, `LICENSE.spdx`) are skipped. Distinct texts are joined, `LICENSE` files first.
3. Nothing found: the package needs attention.

With `--ci`, or when there's no terminal, the run fails after listing every package without text. On a terminal, you're prompted per package to provide a file path, paste the text (end with a line containing only `.`), use a bundled SPDX template (`MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`, with the copyright line taken from the package author), or skip it. Template-generated text is flagged for review in the summary.

## Terminal behavior

- Progress, warnings, and errors go to stderr. Only `-o -` writes to stdout, so pipes stay clean.
- Colors turn on for a TTY. `NO_COLOR`, `--no-color`, `TERM=dumb` turn them off, and `FORCE_COLOR` forces them on.
- The ASCII hero, spinner, and prompts appear only on an interactive terminal outside CI. Otherwise output is plain, line-based text.
- Unicode glyphs fall back to ASCII when the terminal is unlikely to render them. `TPN_ASCII=1` forces the fallback.
- `DEBUG=third-party-notices` prints stack traces for unexpected errors.

## Migrating from generate-license-file

- The flags match, so most invocations only change the command name.
- Config file names and discovery differ: use `third-party-notices.config.json`, `.mjs`, or the `package.json` key. YAML, JSON5, and `.glf` file names aren't read.
- The config keys `inputs`, `output`, `lineEnding`, `append`, `replace`, `exclude`, and `omitVersions` carry over.
- Missing `--input` or `--output` use defaults instead of prompting.
- The output header names this package instead of generate-license-file.
- There's no library API.

## Development

Requires Node 22 or newer.

```bash
npm ci
npm run build
npm test
npm run lint
```

`npm run test:coverage` prints coverage, and `npm run pack:check` verifies the tarball contents and that no runtime dependencies are declared.

CI runs the tests on Linux, Windows, and macOS with Node 22 and 24, plus [zizmor](https://github.com/zizmorcore/zizmor) (pedantic persona), [MegaLinter](https://github.com/oxsecurity/megalinter), and a single [are-we-good](https://github.com/lowlydba/are-we-good) roll-up check. Linux jobs run under step-security harden-runner in block mode. Releases publish from a `v*.*.*` tag with npm trusted publishing, so no npm token is stored.

## License

ISC. The feature set and output format follow [generate-license-file](https://github.com/TobyAndToby/generate-license-file) (ISC, Copyright (c) 2021-2023, Toby Bessant & Toby Smith). No code from it is included.
