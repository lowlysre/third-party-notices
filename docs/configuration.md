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
  "append": ["./additional-content.txt"],
  "replace": {
    "some-package@4.33.1": "./bespoke-license.txt",
    "another-package": "./bespoke-license-2.txt"
  },
  "exclude": ["your-package", "my-package@1.2.0", "/^@types\\//"]
}
```

## Keys

- `inputs`: `package.json` files (or directories containing one) to scan.
- `output`: output file, or `-` for stdout.
- `lineEnding`: `lf` or `crlf`.
- `omitVersions`: list `name` instead of `name@version`.
- `overwrite`: replace an existing output file without asking.
- `append`: file contents added after the last license group.
- `replace`: use the given file instead of the package's license. Keys are `name` or `name@version`.
- `exclude`: omit packages. Entries are `name`, `name@version`, or a `/regex/flags` matched against the name.
- `failOn`: license review categories that make the run exit 1, for example `["copyleft"]`. See [License review](how-it-works.md#license-review).
- `allow`: packages to leave out of the license review. Entries use the same forms as `exclude`.

## Rules

- Command line options override the config, and the config overrides the defaults.
- Relative paths resolve against the directory of the config file.
- Unknown keys and wrong types are errors, listed together with their key path. A misspelled key gets a suggestion.
