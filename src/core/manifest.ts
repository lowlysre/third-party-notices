import type { ResolvedPackage } from "./types.js";

/** The `package.json` fields this tool reads. */
export interface Manifest {
  name?: string;
  version?: string;
  license?: unknown;
  licenses?: unknown;
  homepage?: unknown;
  repository?: unknown;
  author?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const licenseName = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  const type = (value as { type?: unknown } | null)?.type;
  return typeof type === "string" ? type : undefined;
};

/** The declared license as one expression; the legacy `licenses` array becomes an OR. */
export function declaredLicense({ license, licenses }: Manifest): string | undefined {
  if (Array.isArray(licenses)) {
    const names = licenses.map(licenseName).filter((name) => name !== undefined);
    if (names.length > 0) return names.join(" OR ");
  }
  return licenseName(license) ?? licenseName(licenses);
}

/** Web URL for npm's repository forms: `git+https://…`, `git://…`, `github:user/repo`, `user/repo`. */
export function repositoryUrl(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : (value as { url?: unknown } | null)?.url;
  const text = typeof raw === "string" ? raw.trim() : "";
  const shorthand = /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/.exec(text);
  if (shorthand) {
    const hosts = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" };
    return `https://${hosts[(shorthand[1] ?? "github") as keyof typeof hosts]}/${shorthand[2]}`;
  }
  const url = text
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git(?:#.*)?$/, "");
  return /^https?:\/\//.test(url) ? url : undefined;
}

/** The author's name from either `"Name <email> (url)"` or `{ name }`. */
export function authorName(author: unknown): string | undefined {
  const name =
    typeof author === "string" ? author.replace(/\s*[<(].*$/, "") : (author as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

export function describePackage(manifest: Manifest, dir: string, fallbackName: string): ResolvedPackage {
  return {
    name: manifest.name ?? fallbackName,
    version: manifest.version ?? "0.0.0",
    dir,
    license: declaredLicense(manifest),
    homepage: typeof manifest.homepage === "string" ? manifest.homepage : undefined,
    repository: repositoryUrl(manifest.repository),
    author: authorName(manifest.author),
  };
}
