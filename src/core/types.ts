export type LineEnding = "lf" | "crlf";

/** A production dependency found in `node_modules`. */
export interface ResolvedPackage {
  name: string;
  version: string;
  /** Real path of the package directory. */
  dir: string;
  /** Declared license expression, if any. */
  license: string | undefined;
  homepage: string | undefined;
  /** Web URL of the source repository, if declared. */
  repository: string | undefined;
  author: string | undefined;
}

/** A package with the license text (and NOTICE files) to print for it. */
export interface LicensedPackage {
  name: string;
  version: string;
  text: string;
  notices: string[];
}

/** License text supplied for a package that shipped none. `generated` text came from a template. */
export type LicenseChoice = { text: string; generated: boolean } | undefined;
