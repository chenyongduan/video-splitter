# 日志查看工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level「日志查看」tab where the user pastes arbitrary log text and browses/searches it with variable-height virtualized scrolling.

**Architecture:** New `src/pages/log/` page (pure frontend, zero Rust, zero new deps). Text is pasted into a textarea, split into lines, and rendered through a hand-rolled **variable-height virtual scroller**. Line heights derive from monospace arithmetic (`rows = ceil(chars × charWidth / contentWidth)`), so no per-line pixel measurement is needed. Search mirrors the existing `src/pages/json/JsonSearchBar.tsx` UX (case/whole-word/regex toggles, match count, prev/next, Enter-to-search).

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Ant Design 6, Vite 7.

## Global Constraints

- **No new dependencies.** Pure frontend React + antd only.
- **No test/lint runner exists** in this project. Verification per task = `npx tsc --noEmit` (type-check) + the documented manual app check. Keep pure functions pure so they are unit-testable if a runner is added later.
- UI copy is **Simplified Chinese** (matches the rest of the app).
- Follow existing conventions: inline styles (the codebase uses inline `style={{}}`, no CSS modules), antd components, `React.FC`.
- Files live under `src/pages/log/`. Each file has one responsibility.
- `AppTab` lives at `src/types/index.ts:53`.
- Type-check command: `npx tsc --noEmit` (run from repo root).
- Dev run command: `pnpm dev` (frontend at http://localhost:1420) — sufficient for verifying this feature; `pnpm tauri dev` not required since the feature touches no Rust/sidecar.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/index.ts` (modify) | Add `"log"` to `AppTab` union |
| `src/App.tsx` (modify) | Register tab, route, localStorage whitelist, import |
| `src/pages/log/highlight.ts` (create) | Pure: `buildMatcher`, `highlightSegments`, types `LineMatcher`/`MatchRange`/`TextSegment` |
| `src/pages/log/useLogSearch.ts` (create) | Search hook: matcher + line scan + match list + current pointer + nav |
| `src/pages/log/LogLine.tsx` (create) | Render one logical line: number + wrapped highlighted content |
| `src/pages/log/LogViewer.tsx` (create) | Variable-height virtual scroller; exposes `scrollToLine` via ref |
| `src/pages/log/LogSearchBar.tsx` (create) | Search bar UI (mirrors `JsonSearchBar.tsx`) |
| `src/pages/log/LogToolbar.tsx` (create) | Toolbar: line count, clear, open-search |
| `src/pages/log/index.tsx` (create) | Page entry: input/view states, owns `text`, wires subcomponents |

Dependency order (build bottom-up): `highlight.ts` → `useLogSearch.ts` → `LogLine.tsx` → `LogViewer.tsx` → `LogSearchBar.tsx` + `LogToolbar.tsx` → `index.tsx` → App wiring.

---

## Task 1: Wire up the tab with a scaffold LogPage

Goal: a clickable「日志查看」tab that shows a working paste textarea (input state only). This makes the feature reachable end-to-end early; later tasks fill in the viewer/search.

**Files:**
- Modify: `src/types/index.ts:53`
- Modify: `src/App.tsx`
- Create: `src/pages/log/index.tsx`

**Interfaces:**
- Produces: `LogPage` default export from `src/pages/log/index.tsx`. `AppTab` now includes `"log"`.

- [ ] **Step 1: Add `"log"` to AppTab**

In `src/types/index.ts`, change line 53 from:
```ts
export type AppTab = "video" | "audio" | "image" | "icon" | "json";
```
to:
```ts
export type AppTab = "video" | "audio" | "image" | "icon" | "json" | "log";
```

- [ ] **Step 2: Create scaffold LogPage**

Create `src/pages/log/index.tsx`:
```tsx
import React, { useState } from "react";
import { Button, Input } from "antd";

const LogPage: React.FC = () => {
  const [inputText, setInputText] = useState("");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 24, gap: 12 }}>
      <Input.TextArea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="粘贴日志文本…"
        style={{ flex: 1, resize: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
      />
      <div>
        <Button type="primary" disabled={inputText.length === 0}>
          查看日志
        </Button>
      </div>
    </div>
  );
};

export default LogPage;
```

- [ ] **Step 3: Register the tab in App.tsx**

In `src/App.tsx`:
- Add to imports (next to the other page imports):
```tsx
import LogPage from "./pages/log";
```
- In the `Tabs` `items` array, append:
```tsx
{ key: "log", label: "日志查看" },
```
- In `<Content>`, append:
```tsx
{activeTab === "log" && <LogPage />}
```
- In the `useEffect` localStorage restore, update the whitelist array from:
```ts
if (saved && ["video", "audio", "image", "icon", "json"].includes(saved)) {
```
to:
```ts
if (saved && ["video", "audio", "image", "icon", "json", "log"].includes(saved)) {
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verify**

Run: `pnpm dev`, open http://localhost:1420, click the「日志查看」tab.
Expected: a textarea with placeholder「粘贴日志文本…」and a「查看日志」button (disabled until you type). Typing enables the button.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/App.tsx src/pages/log/index.tsx
git commit -m "feat(log): scaffold log viewer tab with paste input"
```

---

## Task 2: Pure highlight module (`highlight.ts`)

Goal: pure, framework-free matching + segment splitting. No React. This is the testable core.

**Files:**
- Create: `src/pages/log/highlight.ts`

**Interfaces:**
- Produces:
  - `interface MatchRange { start: number; end: number }` (end exclusive)
  - `interface TextSegment { text: string; match: boolean }`
  - `type LineMatcher = (line: string) => MatchRange[]`
  - `interface SearchOptions { query: string; caseSensitive: boolean; wholeWord: boolean; useRegex: boolean }`
  - `type BuildMatcherResult = { ok: true; matcher: LineMatcher } | { ok: false; reason: "empty" | "invalid" }`
  - `function buildMatcher(opts: SearchOptions): BuildMatcherResult`
  - `function highlightSegments(line: string, matcher: LineMatcher | null): TextSegment[]`

- [ ] **Step 1: Write the module**

Create `src/pages/log/highlight.ts`:
```ts
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
  if (!matcher) {
    return [{ text: line.length ? line : " ", match: false }];
  }
  const ranges = matcher(line);
  if (ranges.length === 0) {
    return [{ text: line.length ? line : " ", match: false }];
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Reasoning check (no runner — eyeball these)**

- `buildMatcher({query:"err", caseSensitive:false, wholeWord:false, useRegex:false})` → `ok:true`; matcher on `"error here"` → `[{start:0,end:3}]`. On `"no match"` → `[]`.
- `buildMatcher({query:"(unclosed", useRegex:true, ...})` → `ok:false, reason:"invalid"`.
- `buildMatcher({query:"", ...})` → `ok:false, reason:"empty"`.
- `highlightSegments("a b a", matcherForA)` → `[{a,match:true},{ " ",false},{b... }]` covering the whole string with no gaps.

- [ ] **Step 4: Commit**

```bash
git add src/pages/log/highlight.ts
git commit -m "feat(log): add pure matcher and highlight-segment helpers"
```

---

## Task 3: Search hook (`useLogSearch.ts`)

Goal: encapsulate all search state + actions, driven off a `lines` array.

**Files:**
- Create: `src/pages/log/useLogSearch.ts`

**Interfaces:**
- Consumes: `buildMatcher`, `LineMatcher` from `./highlight`.
- Produces: `function useLogSearch(lines: string[])` returning:
```ts
{
  query: string; setQuery: (q: string) => void;
  caseSensitive: boolean; toggleCase: () => void;
  wholeWord: boolean; toggleWholeWord: () => void;
  useRegex: boolean; toggleRegex: () => void;
  showSearch: boolean; openSearch: () => void; closeSearch: () => void;
  runSearch: () => string | null;   // error message or null
  next: () => void; prev: () => void;
  matchLineIndices: number[];
  currentIndex: number;             // -1 when none
  currentLine: number | null;       // matchLineIndices[currentIndex], or null
  activeMatcher: LineMatcher | null;
  reset: () => void;                // clear all results (keep query)
}
```

- [ ] **Step 1: Write the hook**

Create `src/pages/log/useLogSearch.ts`:
```ts
import { useCallback, useState } from "react";
import { buildMatcher, type LineMatcher } from "./highlight";

export function useLogSearch(lines: string[]) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [activeMatcher, setActiveMatcher] = useState<LineMatcher | null>(null);
  const [matchLineIndices, setMatchLineIndices] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const runSearch = useCallback((): string | null => {
    const res = buildMatcher({ query, caseSensitive, wholeWord, useRegex });
    if (!res.ok) {
      setActiveMatcher(null);
      setMatchLineIndices([]);
      setCurrentIndex(-1);
      return res.reason === "invalid" ? "正则表达式无效" : null;
    }
    const idx: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (res.matcher(lines[i]).length > 0) idx.push(i);
    }
    setActiveMatcher(res.matcher);
    setMatchLineIndices(idx);
    setCurrentIndex(idx.length > 0 ? 0 : -1);
    return null;
  }, [query, caseSensitive, wholeWord, useRegex, lines]);

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      if (matchLineIndices.length === 0) return -1;
      return (i + 1) % matchLineIndices.length;
    });
  }, [matchLineIndices.length]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => {
      if (matchLineIndices.length === 0) return -1;
      return (i - 1 + matchLineIndices.length) % matchLineIndices.length;
    });
  }, [matchLineIndices.length]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setActiveMatcher(null);
    setMatchLineIndices([]);
    setCurrentIndex(-1);
  }, []);

  const reset = useCallback(() => {
    setActiveMatcher(null);
    setMatchLineIndices([]);
    setCurrentIndex(-1);
  }, []);

  const currentLine =
    currentIndex >= 0 && currentIndex < matchLineIndices.length
      ? matchLineIndices[currentIndex]
      : null;

  return {
    query,
    setQuery,
    caseSensitive,
    toggleCase: () => setCaseSensitive((v) => !v),
    wholeWord,
    toggleWholeWord: () => setWholeWord((v) => !v),
    useRegex,
    toggleRegex: () => setUseRegex((v) => !v),
    showSearch,
    openSearch: () => setShowSearch(true),
    closeSearch,
    runSearch,
    next,
    prev,
    matchLineIndices,
    currentIndex,
    currentLine,
    activeMatcher,
    reset,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (note: `noUnusedLocals` — every returned value is consumed by Task 6, so no unused exports here).

- [ ] **Step 3: Commit**

```bash
git add src/pages/log/useLogSearch.ts
git commit -m "feat(log): add useLogSearch hook for match scanning and navigation"
```

---

## Task 4: `LogLine` component

Goal: render one logical line — line number column + wrapped content with match highlights.

**Files:**
- Create: `src/pages/log/LogLine.tsx`

**Interfaces:**
- Consumes: `highlightSegments`, `LineMatcher` from `./highlight`.
- Produces: `LogLine` React component with props:
```ts
interface LogLineProps {
  line: string;
  lineNumber: number;          // 1-based
  matcher: LineMatcher | null;
  lineNumberWidth: number;
  isCurrent: boolean;
  top: number;
  height: number;
}
```

- [ ] **Step 1: Write the component**

Create `src/pages/log/LogLine.tsx`:
```tsx
import React, { useMemo } from "react";
import { highlightSegments, type LineMatcher } from "./highlight";

export const LINE_HEIGHT = 20;
export const LOG_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const LOG_FONT_SIZE = 13;

interface LogLineProps {
  line: string;
  lineNumber: number; // 1-based
  matcher: LineMatcher | null;
  lineNumberWidth: number;
  isCurrent: boolean;
  top: number;
  height: number;
}

const LogLine: React.FC<LogLineProps> = ({
  line,
  lineNumber,
  matcher,
  lineNumberWidth,
  isCurrent,
  top,
  height,
}) => {
  const segments = useMemo(
    () => highlightSegments(line, matcher),
    [line, matcher]
  );

  return (
    <div
      style={{
        position: "absolute",
        top,
        height,
        left: 0,
        right: 0,
        display: "flex",
        background: isCurrent ? "#fff7e6" : "transparent",
        borderLeft: isCurrent
          ? "2px solid #fa8c16"
          : "2px solid transparent",
      }}
    >
      <div
        style={{
          width: lineNumberWidth,
          textAlign: "right",
          paddingRight: 8,
          color: "#999",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {lineNumber}
      </div>
      <div
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          flex: 1,
          paddingLeft: 8,
          paddingRight: 8,
        }}
      >
        {segments.map((s, i) =>
          s.match ? (
            <mark key={i} style={{ background: "#ffe58f", color: "#000" }}>
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          )
        )}
      </div>
    </div>
  );
};

export default LogLine;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/log/LogLine.tsx
git commit -m "feat(log): add LogLine component with line number and match highlights"
```

---

## Task 5: `LogViewer` — variable-height virtual scroller

Goal: render only the visible window of lines; expose `scrollToLine` via ref. This is the core performance piece.

**Files:**
- Create: `src/pages/log/LogViewer.tsx`

**Interfaces:**
- Consumes: `LogLine`, `LINE_HEIGHT`, `LOG_FONT`, `LOG_FONT_SIZE` from `./LogLine`; `LineMatcher` from `./highlight`.
- Produces:
  - `interface LogViewerHandle { scrollToLine: (lineIndex: number) => void }`
  - `LogViewer` (forwarded ref) with props:
```ts
interface LogViewerProps {
  lines: string[];
  matcher: LineMatcher | null;
  currentLine: number | null;   // 0-based line index to highlight + scroll to
}
```

**Geometry (pure, documented for review):** given `lines`, measured `charWidth`, and `containerWidth`:
- `lineNumberWidth = max(48, ceil(digits(chars in lines.length)) × charWidth + 16)`
- `contentWidth = max(50, containerWidth − lineNumberWidth − 16)` (16px right padding)
- `rows[i] = max(1, ceil(lines[i].length × charWidth / contentWidth))`
- `prefixSum[0] = 0`; `prefixSum[i+1] = prefixSum[i] + rows[i] × LINE_HEIGHT`
- `totalHeight = prefixSum[lines.length]`

**Visible window:** first line `i` where `prefixSum[i+1] > scrollTop`; render forward until `prefixSum[j] > scrollTop + viewportHeight`, ±`OVERSCAN` (3).

- [ ] **Step 1: Write the component**

Create `src/pages/log/LogViewer.tsx`:
```tsx
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import LogLine, { LINE_HEIGHT, LOG_FONT, LOG_FONT_SIZE } from "./LogLine";
import type { LineMatcher } from "./highlight";

const OVERSCAN = 3;
const RIGHT_PADDING = 16;

export interface LogViewerHandle {
  scrollToLine: (lineIndex: number) => void;
}

interface LogViewerProps {
  lines: string[];
  matcher: LineMatcher | null;
  currentLine: number | null; // 0-based
}

function measureCharWidth(): number {
  if (typeof document === "undefined") return 7.8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 7.8;
  ctx.font = `${LOG_FONT_SIZE}px ${LOG_FONT}`;
  return ctx.measureText("M").width;
}

// Binary search: smallest i in [0, n-1] with prefixSum[i+1] > scrollTop.
function findStartIndex(prefixSum: number[], scrollTop: number): number {
  let lo = 0;
  let hi = prefixSum.length - 1; // lines count
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefixSum[mid + 1] > scrollTop) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const LogViewer = forwardRef<LogViewerHandle, LogViewerProps>(
  ({ lines, matcher, currentLine }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);

    const charWidth = useMemo(() => measureCharWidth(), []);

    // Measure + observe container width.
    useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      setContainerWidth(el.clientWidth);
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) setContainerWidth(e.contentRect.width);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const geo = useMemo(() => {
      const n = lines.length;
      const digits = String(Math.max(1, n)).length;
      const lineNumberWidth = Math.max(
        48,
        Math.ceil(digits * charWidth) + 16
      );
      const contentWidth = Math.max(
        50,
        containerWidth - lineNumberWidth - RIGHT_PADDING
      );
      const prefixSum = new Array<number>(n + 1);
      prefixSum[0] = 0;
      for (let i = 0; i < n; i++) {
        const rows = Math.max(
          1,
          Math.ceil((lines[i].length * charWidth) / contentWidth)
        );
        prefixSum[i + 1] = prefixSum[i] + rows * LINE_HEIGHT;
      }
      return { lineNumberWidth, prefixSum, totalHeight: prefixSum[n] };
    }, [lines, charWidth, containerWidth]);

    const viewportHeight = scrollRef.current?.clientHeight ?? 0;

    const { startIndex, endIndex } = useMemo(() => {
      if (geo.prefixSum.length <= 1)
        return { startIndex: 0, endIndex: 0 };
      let start = findStartIndex(geo.prefixSum, scrollTop) - OVERSCAN;
      if (start < 0) start = 0;
      let end = start;
      const limit = scrollTop + viewportHeight + OVERSCAN * LINE_HEIGHT;
      while (
        end < lines.length &&
        geo.prefixSum[end] < limit
      ) {
        end++;
      }
      end += OVERSCAN;
      if (end > lines.length) end = lines.length;
      return { startIndex: start, endIndex: end };
    }, [geo, scrollTop, viewportHeight, lines.length]);

    const scrollToLine = useCallback(
      (lineIndex: number) => {
        const el = scrollRef.current;
        if (!el) return;
        const clamped = Math.max(0, Math.min(lineIndex, lines.length - 1));
        const target = geo.prefixSum[clamped];
        // Try to center the line in the viewport.
        const centered = Math.max(
          0,
          target - (el.clientHeight - 4 * LINE_HEIGHT) / 2
        );
        el.scrollTop = centered;
        setScrollTop(centered);
      },
      [geo.prefixSum, lines.length]
    );

    useImperativeHandle(ref, () => ({ scrollToLine }), [scrollToLine]);

    // Scroll to currentLine whenever it changes.
    React.useEffect(() => {
      if (currentLine != null) scrollToLine(currentLine);
    }, [currentLine, scrollToLine]);

    const rows: React.ReactNode[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      rows.push(
        <LogLine
          key={i}
          line={lines[i]}
          lineNumber={i + 1}
          matcher={matcher}
          lineNumberWidth={geo.lineNumberWidth}
          isCurrent={currentLine === i}
          top={geo.prefixSum[i]}
          height={geo.prefixSum[i + 1] - geo.prefixSum[i]}
        />
      );
    }

    return (
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{
          flex: 1,
          position: "relative",
          overflow: "auto",
          fontFamily: LOG_FONT,
          fontSize: LOG_FONT_SIZE,
          lineHeight: `${LINE_HEIGHT}px`,
          background: "#fff",
        }}
      >
        <div style={{ position: "relative", height: geo.totalHeight }}>
          {rows}
        </div>
      </div>
    );
  }
);

LogViewer.displayName = "LogViewer";

export default LogViewer;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/log/LogViewer.tsx
git commit -m "feat(log): add variable-height virtualized LogViewer"
```

---

## Task 6: `LogSearchBar`, `LogToolbar`, and wire into `index.tsx`

Goal: full search UX + view state, replacing the Task 1 scaffold.

**Files:**
- Create: `src/pages/log/LogSearchBar.tsx`
- Create: `src/pages/log/LogToolbar.tsx`
- Modify: `src/pages/log/index.tsx` (replace scaffold)

**Interfaces:**
- Consumes: `useLogSearch`, `LogViewer` (+ `LogViewerHandle`).
- Produces: completed `LogPage`.

- [ ] **Step 1: Write `LogSearchBar.tsx`**

Create `src/pages/log/LogSearchBar.tsx` (mirrors `src/pages/json/JsonSearchBar.tsx` styling):
```tsx
import React, { useEffect, useRef } from "react";
import { Input, Button, Space, Tooltip } from "antd";
import {
  CloseOutlined,
  UpOutlined,
  DownOutlined,
  SearchOutlined,
} from "@ant-design/icons";

interface LogSearchBarProps {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchCount: number;
  currentIndex: number;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onToggleCase: () => void;
  onToggleWholeWord: () => void;
  onToggleRegex: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

const LogSearchBar: React.FC<LogSearchBarProps> = ({
  query,
  caseSensitive,
  wholeWord,
  useRegex,
  matchCount,
  currentIndex,
  onQueryChange,
  onSearch,
  onToggleCase,
  onToggleWholeWord,
  onToggleRegex,
  onNext,
  onPrev,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const matchText =
    matchCount === 0 ? "无结果" : `${currentIndex + 1}/${matchCount}`;
  const matchColor = matchCount === 0 ? "#ff4d4f" : "#666";

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: active ? "1px solid #1677ff" : "1px solid #d9d9d9",
    borderRadius: 4,
    background: active ? "#e6f4ff" : "#fff",
    color: active ? "#1677ff" : "#666",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    userSelect: "none",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 16,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px",
        background: "#fff",
        borderRadius: "0 0 6px 6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        border: "1px solid #e8e8e8",
        borderTop: "none",
      }}
    >
      <Input
        ref={inputRef as React.Ref<HTMLInputElement>}
        size="small"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onPressEnter={onSearch}
        placeholder="搜索... (回车搜索)"
        style={{ width: 200, fontSize: 13 }}
        prefix={<SearchOutlined style={{ color: "#999" }} />}
      />
      <Space size={2}>
        <Tooltip title="区分大小写">
          <div style={btnStyle(caseSensitive)} onClick={onToggleCase}>
            Aa
          </div>
        </Tooltip>
        <Tooltip title="全词匹配">
          <div style={btnStyle(wholeWord)} onClick={onToggleWholeWord}>
            Ab
          </div>
        </Tooltip>
        <Tooltip title="正则表达式">
          <div style={btnStyle(useRegex)} onClick={onToggleRegex}>
            .*
          </div>
        </Tooltip>
      </Space>
      <span
        style={{
          fontSize: 12,
          color: matchColor,
          minWidth: 44,
          textAlign: "center",
        }}
      >
        {matchText}
      </span>
      <Space size={2}>
        <Button
          size="small"
          icon={<UpOutlined />}
          onClick={onPrev}
          disabled={matchCount === 0}
          style={{ width: 28, height: 28 }}
        />
        <Button
          size="small"
          icon={<DownOutlined />}
          onClick={onNext}
          disabled={matchCount === 0}
          style={{ width: 28, height: 28 }}
        />
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ width: 28, height: 28 }}
        />
      </Space>
    </div>
  );
};

export default LogSearchBar;
```

- [ ] **Step 2: Write `LogToolbar.tsx`**

Create `src/pages/log/LogToolbar.tsx`:
```tsx
import React from "react";
import { Button, Space, Typography } from "antd";
import { SearchOutlined, DeleteOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface LogToolbarProps {
  lineCount: number;
  onOpenSearch: () => void;
  onClear: () => void;
}

const LogToolbar: React.FC<LogToolbarProps> = ({
  lineCount,
  onOpenSearch,
  onClear,
}) => {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        共 {lineCount.toLocaleString()} 行
      </Text>
      <Space>
        <Button icon={<SearchOutlined />} onClick={onOpenSearch}>
          搜索
        </Button>
        <Button icon={<DeleteOutlined />} danger onClick={onClear}>
          清空
        </Button>
      </Space>
    </div>
  );
};

export default LogToolbar;
```

- [ ] **Step 3: Replace `index.tsx` with full page**

Replace `src/pages/log/index.tsx` entirely:
```tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, message } from "antd";
import LogToolbar from "./LogToolbar";
import LogSearchBar from "./LogSearchBar";
import LogViewer, { type LogViewerHandle } from "./LogViewer";
import { useLogSearch } from "./useLogSearch";

const LogPage: React.FC = () => {
  const [inputText, setInputText] = useState("");
  const [text, setText] = useState("");

  const lines = useMemo(
    () => (text.length ? text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n") : []),
    [text]
  );
  const search = useLogSearch(lines);
  const viewerRef = useRef<LogViewerHandle>(null);

  const loaded = text.length > 0;

  const handleLoad = () => {
    const t = inputText;
    setText(t);
    search.reset();
  };

  const handleClear = () => {
    setText("");
    setInputText("");
    search.reset();
  };

  const handleSearch = () => {
    const err = search.runSearch();
    if (err) message.error(err);
  };

  // Keep input textarea in sync if we ever return to input state with content.
  useEffect(() => {
    if (!loaded) {
      // no-op; inputText is the source of truth in input state
    }
  }, [loaded]);

  if (!loaded) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 24,
          gap: 12,
        }}
      >
        <Input.TextArea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleLoad();
            }
          }}
          placeholder="粘贴日志文本…  (Ctrl/Cmd+Enter 查看)"
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
          }}
        />
        <div>
          <Button
            type="primary"
            onClick={handleLoad}
            disabled={inputText.length === 0}
          >
            查看日志
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <LogToolbar
        lineCount={lines.length}
        onOpenSearch={search.openSearch}
        onClear={handleClear}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {search.showSearch && (
          <LogSearchBar
            query={search.query}
            caseSensitive={search.caseSensitive}
            wholeWord={search.wholeWord}
            useRegex={search.useRegex}
            matchCount={search.matchLineIndices.length}
            currentIndex={search.currentIndex}
            onQueryChange={search.setQuery}
            onSearch={handleSearch}
            onToggleCase={search.toggleCase}
            onToggleWholeWord={search.toggleWholeWord}
            onToggleRegex={search.toggleRegex}
            onNext={search.next}
            onPrev={search.prev}
            onClose={search.closeSearch}
          />
        )}
        <LogViewer
          ref={viewerRef}
          lines={lines}
          matcher={search.activeMatcher}
          currentLine={search.currentLine}
        />
      </div>
    </div>
  );
};

export default LogPage;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `noUnusedLocals` flags the empty `useEffect`, delete that effect entirely (it was a placeholder guard) — the page works without it.

- [ ] **Step 5: Manual verify (full feature)**

Run `pnpm dev`, open the「日志查看」tab.

Paste this sample:
```
[INFO] server started on port 8080
[WARN] disk almost full
[ERROR] connection timeout
[INFO] retrying
[ERROR] connection timeout again
```
Click「查看日志」.

- 5 lines render, each with a 1-based line number; long lines wrap.
- Click「搜索」, type `error`, press Enter → 2 matches, counter shows `1/2`, both ERROR lines' `error` substring is highlighted yellow, current line has an orange left border.
- Click ↓ → counter `2/2`, view scrolls to the second match. ↑ returns.
- Toggle `Aa` (case-sensitive) + re-Enter → 0 matches (`error` ≠ `ERROR`), counter red「无结果」.
- Toggle `.*` (regex), query `ERROR.*timeout`, Enter → 2 matches.
- Toggle `.*`, query `(unclosed`, Enter → antd error toast「正则表达式无效」, no crash.
- Click「清空」→ returns to the empty paste view.

- [ ] **Step 6: Commit**

```bash
git add src/pages/log/LogSearchBar.tsx src/pages/log/LogToolbar.tsx src/pages/log/index.tsx
git commit -m "feat(log): add search bar, toolbar, and wire up full log viewer page"
```

---

## Task 7: Large-log, resize, and polish verification pass

Goal: confirm the performance + edge-case guarantees from the spec, fix anything found. No new code unless a bug surfaces.

**Files:**
- Possibly modify any `src/pages/log/*` file if a bug is found (record what + why in the commit).

- [ ] **Step 1: Generate a large log and verify scrolling performance**

In the paste textarea, generate ~100,000 lines. Easiest: paste this into the browser devtools console while on the input view to fill the textarea is not wired — instead, prepare a large clipboard. Pragmatic alternative: temporarily lower the bar — paste a real large log file's contents, or generate with a one-liner copied into the textarea:

Run in the app: paste the output of this shell command (copy it) into the textarea:
```bash
yes "[INFO] line with some moderately long content to exercise wrapping aaaaaaaaaaaa $(date)" | head -100000 | pbcopy
```
Then「查看日志」.

Expected: viewer opens promptly; scrolling is smooth (no jank); only visible rows are in the DOM (verify in devtools Elements — the inner container has a handful of `.LogLine`-style row divs, not 100k). Counter shows「共 100,000 行」.

- [ ] **Step 2: Verify resize recomputes wrap**

With the large log loaded, slowly resize the Tauri/browser window width.
Expected: lines re-wrap (number of wrapped rows per line changes), no overlap/gaps between rows, total scroll height updates. A row should never visually overlap its neighbor.

- [ ] **Step 3: Verify search on large log**

Open search, query `INFO`, Enter.
Expected: scan completes without freezing the UI for more than ~1s; counter shows a large match count; ↓/↑ jump between matches and scroll correctly (including matches far down, which require recomputing the visible window).

- [ ] **Step 4: Verify horizontal behavior / empty-line rendering**

Paste a log containing one very long single line (no newlines) and one empty line:
```
short
<very long line, thousands of chars>

after-empty
```
Expected: the long line wraps to many rows; the empty line renders as a blank row of one line-height (no collapse); line numbers stay correct.

- [ ] **Step 5: Final type-check + (optional) full build**

Run: `npx tsc --noEmit`
Expected: no errors.

(Optional) Run: `pnpm build` (runs `tsc && vite build`).
Expected: build succeeds.

- [ ] **Step 6: Commit any fixes found**

If Task 7 surfaced bugs, commit each fix with a clear message, e.g.:
```bash
git add src/pages/log/LogViewer.tsx
git commit -m "fix(log): recompute visible window on container height change"
```
If no bugs, no commit needed — Task 6's commit is the feature-complete state.

---

## Self-Review Notes

- **Spec coverage:** Tab entry (Task 1), paste input → view flow (Task 1 + 6), line numbers + fixed wrap (Task 4/5), variable-height virtualization with prefix-sum + binary search (Task 5), search mirroring json page with case/whole-word/regex + match count + prev/next + Enter (Task 2/3/6), invalid-regex handling (Task 2/3/6), large-log + resize verification (Task 7). All spec sections mapped.
- **Type consistency:** `LineMatcher`, `MatchRange`, `highlightSegments`, `buildMatcher`/`BuildMatcherResult` defined in Task 2 and consumed unchanged in Tasks 3, 4, 5. `LogViewerHandle.scrollToLine` defined in Task 5, consumed in Task 6. Hook return fields (`activeMatcher`, `currentLine`, `matchLineIndices`, `currentIndex`, `runSearch`, toggles) defined in Task 3 and consumed unchanged in Task 6.
- **Adaptation note:** TDD test-cycle steps replaced by `npx tsc --noEmit` + manual verification because the project has no test runner and the spec mandates zero new deps (Global Constraints).
