export interface UiEnv {
  /** Emit ANSI color/style sequences. */
  color: boolean;
  /** Use Unicode glyphs instead of ASCII fallbacks. */
  unicode: boolean;
  /** Animate (spinner, reveal) and rewrite lines in place. */
  animate: boolean;
  /** Show the ASCII hero banner. */
  hero: boolean;
  /** Emit OSC 8 hyperlinks. */
  hyperlinks: boolean;
  /** Terminal width in columns. */
  columns: number;
}

export interface StreamLike {
  isTTY?: boolean;
  columns?: number;
}

export interface DetectOptions {
  noColor?: boolean;
  noSpinner?: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

export function detectEnv(
  stream: StreamLike,
  env: Environment = process.env,
  options: DetectOptions = {},
  platform: string = process.platform,
): UiEnv {
  const isTty = stream.isTTY === true;
  const dumb = env.TERM === "dumb";
  const ci = isTruthy(env.CI);

  let color = isTty && !dumb;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") {
    color = env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
  }
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    color = false;
  }
  if (options.noColor) {
    color = false;
  }

  const interactive = isTty && !dumb && !ci;
  const animate = interactive && !options.noSpinner;

  return {
    color,
    unicode: supportsUnicode(env, platform),
    animate,
    hero: interactive,
    hyperlinks: color && isTty && !ci,
    columns: stream.columns && stream.columns > 0 ? stream.columns : 80,
  };
}

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

function supportsUnicode(env: Environment, platform: string): boolean {
  if (isTruthy(env.TPN_ASCII)) {
    return false;
  }
  if (platform === "win32") {
    return Boolean(
      env.WT_SESSION ||
        env.TERM_PROGRAM === "vscode" ||
        env.TERM_PROGRAM === "WezTerm" ||
        env.ConEmuTask === "{cmd::Cmder}" ||
        env.TERM === "xterm-256color" ||
        env.TERM === "alacritty",
    );
  }
  if (env.TERM === "linux") {
    return false;
  }
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return locale === "" || /utf-?8/i.test(locale);
}
