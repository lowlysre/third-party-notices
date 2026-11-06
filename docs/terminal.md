# Terminal behavior

- Progress, warnings, and errors go to stderr. Only `-o -` writes to stdout, so pipes stay clean.
- Colors turn on for a TTY. `NO_COLOR`, `--no-color`, and `TERM=dumb` turn them off, and `FORCE_COLOR` forces them on.
- The ASCII hero banner, spinner, and prompts appear only on an interactive terminal outside CI. Otherwise output is plain, line-based text. On terminals narrower than 64 columns the banner collapses to one line.
- Unicode glyphs fall back to ASCII when the terminal is unlikely to render them. `TPN_ASCII=1` forces the fallback.
- Prompts use arrow keys (or `j`/`k`), number keys to jump, Enter to confirm, and Escape to skip. Ctrl-C cancels with exit code 130 and restores the cursor.
- `DEBUG=third-party-notices` prints stack traces for unexpected errors.

## Environment variables

| Variable | Effect |
| --- | --- |
| `NO_COLOR` | Disable colors when set to any non-empty value |
| `FORCE_COLOR` | Force colors on (any value except `0` or `false`) |
| `TPN_ASCII` | Use ASCII glyphs instead of Unicode |
| `CI` | Disable animation, the banner, and prompts |
| `TERM=dumb` | Disable colors, animation, the banner, and prompts |
| `DEBUG=third-party-notices` | Print stack traces for unexpected errors |
