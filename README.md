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

It reads the installed `node_modules`, collects each package's license text, groups packages that share identical text, and writes one file.

> [!NOTE]
> The package isn't published to npm yet. Until it is, build from source (see [Development](docs/development.md)).

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
| `--fail-on <categories>` | Exit 1 if a package falls in these [license review](docs/how-it-works.md#license-review) categories. Comma-separated, repeatable |
| `--no-spinner` | Disable the animated spinner |
| `--omit-versions` | List `name` instead of `name@version` |
| `--no-color` | Disable colors |
| `-q, --quiet` | Print only errors |
| `--verbose` | Show extra notes, such as packages that declare a license but ship no license file |
| `-v, --version` | Print the version |
| `-h, --help` | Show help |

Precedence is command line, then config file, then defaults. Exit codes: `0` success, `1` runtime failure or `--ci` found a package without license text, `2` usage error, `130` cancelled with Ctrl-C.

## Docs

- [Configuration](docs/configuration.md): config files, keys, `append`, `replace`, and `exclude`.
- [How it works](docs/how-it-works.md): dependency resolution, license file detection, and the output format.
- [Development](docs/development.md): building, testing, CI, and releases.

## License

ISC, see [LICENSE](LICENSE). Credits and the license notices of the projects below are in [NOTICE](NOTICE).

## Acknowledgments

This project stands on two others, and it would not exist without them.

- [generate-license-file](https://github.com/TobyAndToby/generate-license-file) by Toby Bessant and Toby Smith (ISC). It defined the problem and the shape of the solution: the command line options, the config keys, and the output document layout all follow its design. It's the tool to reach for if you want a library API or need YAML and JSON5 configs. No code from it is included here.
- [Licensee](https://github.com/licensee/licensee) by Ben Balter and contributors (MIT). It's the library behind GitHub's license detection. The license file name rules in `src/resolve/names.ts` are a TypeScript port of its file name scoring, so the files GitHub recognizes as a license are the files found here. That part is derived from its code, which is why its MIT notice is in [NOTICE](NOTICE).

Thank you to both teams.
