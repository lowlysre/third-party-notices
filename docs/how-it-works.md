# How it works

## Dependency resolution

For each input `package.json`, the tool walks `dependencies` and `optionalDependencies` using Node's resolution algorithm against the installed `node_modules`, so hoisted, nested, scoped, and pnpm layouts resolve the same way Node would.

- `devDependencies` are never walked.
- Peer dependencies of a dependency are included when installed. Peer dependencies of the input itself are not walked.
- Packages are deduplicated by real path, which handles symlinks and cycles. The same package at two versions appears twice.
- Packages found outside `node_modules` (workspace members and `link:` or `file:` dependencies) are treated as first-party code: they aren't listed, but their own dependencies are.
- A missing required dependency fails the run and lists every missing package. A missing optional dependency is skipped.

## License text

For each package, the first match wins:

1. A `replace` entry from the config.
2. License files in the package root, using the file name rules GitHub applies through [Licensee](https://github.com/licensee/licensee): `LICENSE`, `LICENCE`, `UNLICENSE`, `COPYING`, `COPYRIGHT`, `OFL`, and `PATENTS`, with extensions and decorations such as `LICENSE-MIT`, `MIT-LICENSE`, or `COPYING.LESSER`. Files in a `LICENSES/` directory are included too, using the [REUSE](https://reuse.software) convention of an SPDX id plus a text extension. Code, data, and image files with those names (`license.js`, `LICENSE.spdx`) are skipped. Distinct texts are joined, best match first.
3. Nothing found: the package needs attention.

With `--ci`, or when there's no terminal, the run fails after listing every package without text.

With `--allow-missing` (or `allowMissing` in the config) the run neither prompts nor fails, with or without a terminal. A package that declares exactly one bundled SPDX id gets that template with the copyright line taken from the package author, flagged for review in the summary. Any other package is skipped with a warning and left out of the notice. Use it when you'd rather ship a notice with a known gap than block CI, and follow up with `replace` entries or the maintainers.

On a terminal without those options, you're prompted per package to provide a file path, paste the text (end with a line containing only `.`), use a bundled SPDX template (`MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`, with the copyright line taken from the package author), or skip it. Template-generated text is flagged for review in the summary. `--verbose` adds a note for each package that declares a license but ships no license file, with a link to ask the maintainers to add one.

The declared license type never changes what's copied. It only feeds the summary chart, the "declares X" hint in prompts, and the template offer.

## License review

A notice file only covers attribution. After writing it, the tool checks each package's declared `license` field and lists the ones whose terms usually need a human decision under "License review" in the summary. It's a signal, not legal advice, and the file is written either way.

| Category | Examples |
| --- | --- |
| `weak-copyleft` | `LGPL-*`, `MPL-*`, `EPL-*`, `CDDL-*`, `EUPL-*`, `CPL-*`, `MS-RL`, `CECILL-*`, and `GPL-*` with a linking exception |
| `strong-copyleft` | `GPL-*`, `CC-BY-SA-*` |
| `network-copyleft` | `AGPL-*`, `SSPL-1.0` |
| `restricted` | `BUSL-*`, `Elastic-*`, `PolyForm-*`, `CC-BY-NC-*`, `CC-BY-ND-*`, `Commons-Clause`, `JSON` |
| `unclear` | `UNLICENSED`, `NONE`, `UNKNOWN`, `SEE LICENSE IN ...`, `LicenseRef-*`, a missing field, or text that isn't a well-formed SPDX expression. Only the syntax is checked. Ids aren't looked up in the SPDX list, so an unrecognized one such as `Proprietary` isn't flagged |

SPDX expressions are evaluated: `MIT OR GPL-3.0-only` is not flagged because you can take the MIT option, while `MIT AND GPL-3.0-only` is flagged as strong copyleft because both apply. The declared field is what's checked, not the license file's text. A well-formed id that isn't in the lists above, such as `Proprietary`, isn't flagged, because there's no bundled SPDX catalog to check it against.

Two options turn the review into a gate. `--fail-on <categories>` (or `failOn` in the config) makes the run exit 1 after writing the file when a package falls in a listed category. Categories can be named individually, or use `copyleft` for the three copyleft categories and `any` for all of them. `allow` in the config leaves specific packages out of the review once you've accepted them.

## Output format

The document opens with a one-line credit header, then lists each group of packages followed by their shared license text, with `NOTICE` files appended under "With the following notices:". A project with nothing to list gets an empty file, without the header. Groups and packages are sorted, so the same input produces the same bytes on every OS for a given `--eol`.

```text
The following npm packages may be included in this product:

 - a@1.0.0
 - b@1.0.0

These packages each contain the following license:

MIT License ...
```

Packages whose license text and notices are identical share one entry, and a line of `-----------` separates entries. Files named with `append` in the config follow the last group.
