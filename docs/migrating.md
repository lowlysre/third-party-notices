# Migrating from generate-license-file

- The flags match, so most invocations only change the command name.
- Config file names and discovery differ: use `third-party-notices.config.json`, `.mjs`, or the `package.json` key. YAML, JSON5, and `.glf` file names aren't read.
- The config keys `inputs`, `output`, `lineEnding`, `append`, `replace`, `exclude`, and `omitVersions` carry over.
- Missing `--input` or `--output` use defaults instead of prompting.
- The output header names this package instead of generate-license-file.
- There's no library API.
