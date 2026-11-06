# Development

Requires Node 22 or newer.

```bash
npm ci
npm run build
npm test
npm run lint
```

`npm run test:coverage` prints coverage and fails below 95% lines, branches, or functions. `npm run pack:check` verifies the tarball contents and that no runtime dependencies are declared. Tests use the built-in `node:test` runner.

## Layout

- `src/core`: pure logic with no I/O (settings, config schema, license review, grouping, rendering, messages).
- `src/resolve`: reads `node_modules` and license files from disk.
- `src/ui`: everything that draws to the terminal or reads keystrokes.
- `src/run.ts` wires the three together, and `src/main.ts` turns the command line and environment into a run.

Tool configs live in `.config/` (TypeScript and Biome), and CI helpers live under `.github/`.

## CI

CI runs the tests on Linux, Windows, and macOS with Node 22 and 24, plus [zizmor](https://github.com/zizmorcore/zizmor) (pedantic persona), [MegaLinter](https://github.com/oxsecurity/megalinter), a pull request title check, and a single [are-we-good](https://github.com/lowlydba/are-we-good) roll-up check. Linux jobs run under step-security harden-runner in block mode, so a new network endpoint needs adding to that job's allowlist.

## Releases

Versions are never edited by hand. [semantic-release](https://semantic-release.gitbook.io) runs on every push to `main`, reads the commits since the last release, and decides whether to publish. `package.json` keeps the placeholder version `0.0.0-development`, and the real version is set only in the published package.

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Squash merges use the pull request title as the commit message, so CI checks that the title follows the format:

| Title | Release |
| --- | --- |
| `fix: …` or `perf: …` | patch |
| `feat: …` | minor |
| `feat!: …`, or a `BREAKING CHANGE:` footer | major |
| `docs:`, `chore:`, `test:`, `refactor:`, `ci:` | none |

A release tags the commit, publishes to npm with trusted publishing (no npm token is stored), and creates a GitHub release with notes generated from the commits. The `v0.0.0` baseline tag on the initial commit makes the first `feat:` release `0.1.0`.

The publish job runs in the `npm` environment, whose name and the workflow file name `release.yml` must match the trusted publisher configured on npmjs.com.
