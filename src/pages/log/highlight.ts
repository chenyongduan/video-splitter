export interface MatchRange {
  start: number;
  end: number; // exclusive
}

export interface TextSegment {
  text: string;
  match: boolean;
}

export type LineMatcher = (line: string) => MatchRange[];

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export type BuildMatcherResult =
  | { ok: true; matcher: LineMatcher }
  | { ok: false; reason: "empty" | "invalid" };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMatcher(opts: SearchOptions): BuildMatcherResult {
  const { query, caseSensitive, wholeWord, useRegex } = opts;
  if (!query) return { ok: false, reason: "empty" };

  let source: string;
  if (useRegex) {
    source = query;
  } else {
    source = escapeRegExp(query);
    if (wholeWord) source = `\\b${source}\\b`;
  }
  const flags = caseSensitive ? "g" : "gi";

  let re: RegExp;
  try {
    re = new RegExp(source, flags);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const matcher: LineMatcher = (line: string): MatchRange[] => {
    const ranges: MatchRange[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m[0].length === 0) {
        // zero-width match (e.g. `a*`): advance to avoid infinite loop
        re.lastIndex++;
        continue;
      }
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
    return ranges;
  };
  return { ok: true, matcher };
}

export function highlightSegments(
  line: string,
  matcher: LineMatcher | null
): TextSegment[] {
  if (!matcher || typeof matcher !== "function") {
    return [{ text: line.length ? line : " ", match: false }];
  }
  const ranges = matcher(line);
  if (ranges.length === 0) {
    return [{ text: line.length ? line : " ", match: false }];
  }
  const segs: TextSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      segs.push({ text: line.slice(cursor, r.start), match: false });
    }
    segs.push({ text: line.slice(r.start, r.end), match: true });
    cursor = r.end;
  }
  if (cursor < line.length) {
    segs.push({ text: line.slice(cursor), match: false });
  }
  return segs;
}
