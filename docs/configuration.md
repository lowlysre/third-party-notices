# Configuration

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
  "allowMissing": false,
  "append": ["./additional-content.txt"],
  "replace": {
    "some-package@4.33.1": "./bespoke-license.txt",
    "another-package": "./bespoke-license-2.txt"
  },
  "exclude": ["your-package", "my-package@1.2.0", "/^@types\\//"],
  "failOn": ["strong-copyleft", "restricted"],
  "allow": ["reviewed-package@2.0.0"]
}
```

## Keys

| Key | Type | Description | Command line |
| --- | --- | --- | --- |
| `inputs` | string[] | `package.json` files (or directories containing one) to scan. Default: `./package.json` | `--input` |
| `output` | string | Output file, or `-` for stdout. Default: `./third-party-licenses.txt` | `--output` |
| `lineEnding` | `"lf"` or `"crlf"` | Line endings of the output. Default: the OS default | `--eol` |
| `omitVersions` | boolean | List `name` instead of `name@version` | `--omit-versions` |
| `overwrite` | boolean | Replace an existing output file without asking | `--overwrite` |
| `allowMissing` | boolean | Use a template or skip packages with no license text instead of prompting or failing. See [License text](how-it-works.md#license-text) | `--allow-missing` |
| `append` | string[] | Files whose contents are added after the last license group | |
| `replace` | object | Use the given file instead of a package's license. Keys are `name` or `name@version` | |
| `exclude` | string[] | Packages to omit: `name`, `name@version`, or a `/regex/flags` matched against the name | |
| `failOn` | string[] | License review categories that make the run exit 1, such as `["copyleft"]`. See [License review](how-it-works.md#license-review) | `--fail-on` |
| `allow` | string[] | Packages to leave out of the license review. Same forms as `exclude` | |

## Rules

- Command line options override the config, and the config overrides the defaults.
- Relative paths resolve against the directory of the config file.
- Unknown keys and wrong types are errors, listed together with their key path. A misspelled key gets a suggestion.
