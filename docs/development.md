# Development

Requires Node 22 or newer.

```bash
npm ci
npm run build
npm test
npm run lint
```

`npm run test:coverage` prints coverage and fails below 95% lines, branches, or functions. `npm run pack:check` verifies the tarball contents and that no runtime dependencies are declared. Tests use the built-in `node:test` runner.

Tool configs live in `.config/` (TypeScript and Biome), and CI helpers live under `.github/`.

## CI

CI runs the tests on Linux, Windows, and macOS with Node 22 and 24, plus [zizmor](https://github.com/zizmorcore/zizmor) (pedantic persona), [MegaLinter](https://github.com/oxsecurity/megalinter), and a single [are-we-good](https://github.com/lowlydba/are-we-good) roll-up check. Linux jobs run under step-security harden-runner in block mode, so a new network endpoint needs adding to that job's allowlist.

## Releases

Releases publish from a `v*.*.*` tag with npm trusted publishing, so no npm token is stored. The tag must match the `package.json` version, and the publish job refuses to run while `"private": true` is set.
