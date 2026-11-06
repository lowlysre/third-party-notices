function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      row[j] = Math.min((row[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, substitution);
    }
    previous = row;
  }
  return previous[b.length] ?? 0;
}

/** The closest candidate by edit distance, if any is near enough to be a likely typo. */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  const scored = candidates.map((candidate) => ({ candidate, score: distance(input, candidate) }));
  const best = scored.sort((a, b) => a.score - b.score)[0];
  return best && best.score <= Math.max(2, Math.floor(input.length / 3)) ? best.candidate : undefined;
}
