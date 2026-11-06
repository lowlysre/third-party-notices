# Command line reference

```bash
third-party-notices [options]   # alias: tpn
```

| Option | Description |
| --- | --- |
| `-i, --input <paths...>` | `package.json` files (or directories containing one) to scan. Default: `./package.json` |
| `-o, --output <path>` | Output file. `-` writes the document to stdout. Default: `./third-party-licenses.txt` |
| `-c, --config <path>` | Config file. Auto-detected when omitted. See [Configuration](configuration.md) |
| `--overwrite` | Replace an existing output file without asking |
| `--eol <lf\|crlf>` | Line endings of the output. Default: the OS default |
| `--ci` | Never prompt. Exit 1 if a license text is missing |
| `--allow-missing` | Don't prompt or fail for packages with no license text: use a bundled SPDX template where one fits, otherwise skip with a warning |
| `--fail-on <categories>` | Exit 1 if a package falls in these [license review](how-it-works.md#license-review) categories. Comma-separated, repeatable |
| `--no-spinner` | Disable the animated spinner |
| `--omit-versions` | List `name` instead of `name@version` |
| `--no-color` | Disable colors |
| `-q, --quiet` | Print only errors |
| `--verbose` | Show extra notes, such as packages that declare a license but ship no license file |
| `-v, --version` | Print the version |
| `-h, --help` | Show help |

Precedence is command line, then config file, then defaults.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime failure, `--ci` found a package without license text, or a package is in a `--fail-on` category |
| `2` | Usage error: an unknown option or a bad value |
| `130` | Cancelled with Ctrl-C |

## Environment

| Variable | Effect |
| --- | --- |
| `NO_COLOR` | Disable colors when set to any non-empty value |
| `FORCE_COLOR` | Force colors on (any value except `0` or `false`) |
| `TPN_ASCII` | Use ASCII glyphs instead of Unicode |
| `CI` | Disable animation, the banner, and prompts |
| `TERM=dumb` | Disable colors, animation, the banner, and prompts |
| `DEBUG=third-party-notices` | Print stack traces for unexpected errors |
