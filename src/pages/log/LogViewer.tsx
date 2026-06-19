import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import LogLine, { LINE_HEIGHT, LOG_FONT, LOG_FONT_SIZE, type RestoreSelection } from "./LogLine";
import { buildMatcher, type LineMatcher } from "./highlight";
import { tryParseTimestamp, formatTimestamp } from "../../utils/timestamp";

const OVERSCAN = 3;
const CONTENT_HORIZONTAL_PADDING = 16;

export interface LogViewerHandle {
  scrollToLine: (lineIndex: number) => void;
}

interface LogViewerProps {
  lines: string[];
  matcher: LineMatcher | null;
  currentLine: number | null; // 0-based
  active?: boolean;
}

function measureCharWidth(): number {
  if (typeof document === "undefined") return 7.8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 7.8;
  ctx.font = `${LOG_FONT_SIZE}px ${LOG_FONT}`;
  return ctx.measureText("M").width;
}

function createLineHeightMeasurer(): (text: string, width: number) => number {
  if (typeof document === "undefined") return () => LINE_HEIGHT;

  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    left: "-10000px",
    top: "0",
    zIndex: "-1",
    fontFamily: LOG_FONT,
    fontSize: `${LOG_FONT_SIZE}px`,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
    padding: "0",
    border: "0",
  });
  document.body.appendChild(el);

  const cache = new Map<string, number>();

  return (text: string, width: number) => {
    if (!text) return LINE_HEIGHT;

    const cacheKey = `${width}\0${text}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    el.style.width = `${width}px`;
    el.textContent = text;

    const rows = Math.max(1, Math.ceil(el.scrollHeight / LINE_HEIGHT));
    const height = rows * LINE_HEIGHT + (rows > 1 ? LINE_HEIGHT / 2 : 0);
    cache.set(cacheKey, height);
    return height;
  };
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
  ({ lines, matcher, currentLine, active = true }, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // Timestamp tooltip state
    const [tsTooltip, setTsTooltip] = useState<{
      text: string;
      left: number;
      top: number;
    } | null>(null);
    const tsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Selection highlight state: selected text is matched across all
    // visible lines and highlighted with <mark>. selInfo also records
    // the exact (line, offset, length) of the browser selection so it
    // can be restored after React re-renders the DOM nodes.
    const [selInfo, setSelInfo] = useState<{
      text: string;
      line: number;
      startOffset: number;
      length: number;
    } | null>(null);

    // Cursor into selectionMatchLines, advanced by Ctrl/Cmd+D. Starts at the
    // line where the selection was made, so the first press jumps to the next
    // occurrence and wraps around at the end.
    const [selMatchCursor, setSelMatchCursor] = useState(-1);

    // Dismiss tooltip and clear selection highlight on deselect.
    // We deliberately do NOT set selInfo here — doing so during an
    // active drag causes a re-render that rewrites DOM nodes, which
    // resets the browser's selection anchor to the start of the line.
    useEffect(() => {
      const onSelectionChange = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setTsTooltip(null);
          setSelInfo(null);
          if (tsTimerRef.current) {
            clearTimeout(tsTimerRef.current);
            tsTimerRef.current = null;
          }
        }
      };
      document.addEventListener("selectionchange", onSelectionChange);
      return () => document.removeEventListener("selectionchange", onSelectionChange);
    }, []);

    // Capture the selected text + exact (line, offset, length) on mouseup —
    // i.e. only after the drag completes. This avoids re-rendering (and
    // rewriting DOM nodes) while the user is still dragging, which would
    // break the selection anchor.
    useEffect(() => {
      const onMouseUp = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const anchor = sel.anchorNode;
        if (!anchor || !scrollRef.current?.contains(anchor)) return;

        const text = sel.toString();
        if (!text) return;

        // Walk text nodes from the content container to find the char
        // offset of the anchor within the line. This lets us restore
        // the selection after React re-renders the DOM.
        const lineEl = (anchor as Element).closest?.('[data-line-idx]')
          ?? (anchor.parentElement?.closest('[data-line-idx]'));
        if (!lineEl) return;
        const lineIdx = Number(lineEl.getAttribute("data-line-idx"));
        if (!Number.isFinite(lineIdx)) return;

        const contentEl = lineEl.querySelector("[data-content]");
        if (!contentEl) return;

        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
        let offset = 0;
        let startOffset = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (node === sel.anchorNode) {
            startOffset = offset + (sel.anchorOffset ?? 0);
            break;
          }
          offset += (node.textContent ?? "").length;
        }

        setSelInfo({ text, line: lineIdx, startOffset, length: text.length });
      };
      document.addEventListener("mouseup", onMouseUp);
      return () => document.removeEventListener("mouseup", onMouseUp);
    }, []);

    const charWidth = useMemo(() => measureCharWidth(), []);
    const measureLineHeight = useMemo(() => createLineHeightMeasurer(), []);

    // Measure + observe container size (both dims so height-only resizes
    // also recompute the visible window).
    useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          setContainerWidth(e.contentRect.width);
          setContainerHeight(e.contentRect.height);
        }
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
        containerWidth - lineNumberWidth - CONTENT_HORIZONTAL_PADDING - 4
      );
      const visibleLineIndexes: number[] = [];
      const originalToVisibleIndex = new Array<number>(n).fill(-1);

      for (let i = 0; i < n; i++) {
        if (lines[i].trim().length === 0) continue;
        originalToVisibleIndex[i] = visibleLineIndexes.length;
        visibleLineIndexes.push(i);
      }

      const prefixSum = new Array<number>(visibleLineIndexes.length + 1);
      prefixSum[0] = 0;
      for (let i = 0; i < visibleLineIndexes.length; i++) {
        const lineIndex = visibleLineIndexes[i];
        prefixSum[i + 1] = prefixSum[i] + measureLineHeight(lines[lineIndex], contentWidth);
      }
      return {
        lineNumberWidth,
        originalToVisibleIndex,
        prefixSum,
        totalHeight: prefixSum[visibleLineIndexes.length],
        visibleLineIndexes,
      };
    }, [lines, charWidth, containerWidth, measureLineHeight]);

    const viewportHeight = containerHeight;

    const { startIndex, endIndex } = useMemo(() => {
      if (geo.prefixSum.length <= 1)
        return { startIndex: 0, endIndex: 0 };
      let start = findStartIndex(geo.prefixSum, scrollTop) - OVERSCAN;
      if (start < 0) start = 0;
      let end = start;
      const limit = scrollTop + viewportHeight + OVERSCAN * LINE_HEIGHT;
      while (
        end < geo.visibleLineIndexes.length &&
        geo.prefixSum[end] < limit
      ) {
        end++;
      }
      end += OVERSCAN;
      if (end > geo.visibleLineIndexes.length) end = geo.visibleLineIndexes.length;
      return { startIndex: start, endIndex: end };
    }, [geo, scrollTop, viewportHeight]);

    const scrollToLine = useCallback(
      (lineIndex: number) => {
        const el = scrollRef.current;
        if (!el) return;
        const clamped = Math.max(0, Math.min(lineIndex, lines.length - 1));
        const visibleIndex = findNearestVisibleIndex(clamped, geo.originalToVisibleIndex);
        if (visibleIndex < 0) return;
        const target = geo.prefixSum[visibleIndex];
        // Try to center the line in the viewport.
        const centered = Math.max(
          0,
          target - (el.clientHeight - 4 * LINE_HEIGHT) / 2
        );
        el.scrollTop = centered;
        setScrollTop(centered);
      },
      [geo.originalToVisibleIndex, geo.prefixSum, lines.length]
    );

    useImperativeHandle(ref, () => ({ scrollToLine }), [scrollToLine]);

    // Scroll to currentLine whenever it changes.
    React.useEffect(() => {
      if (currentLine != null) scrollToLine(currentLine);
    }, [currentLine, scrollToLine]);

    const handleDoubleClick = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const selected = selection.toString().trim();
      const date = tryParseTimestamp(selected);
      if (!date) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = scrollRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      setTsTooltip({
        text: formatTimestamp(date),
        left: rect.left + rect.width / 2 - containerRect.left,
        top: rect.top - containerRect.top - 40 + (scrollRef.current?.scrollTop ?? 0),
      });

      if (tsTimerRef.current) clearTimeout(tsTimerRef.current);
      tsTimerRef.current = setTimeout(() => setTsTooltip(null), 5000);
    }, []);

    // Clear selection highlight on Escape
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (!active) return;
        if (e.key === "Escape") setSelInfo(null);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [active]);

    // Build a matcher from the currently selected text (literal, case-sensitive)
    const selectionMatcher: LineMatcher | null = useMemo(() => {
      if (!selInfo?.text) return null;
      const res = buildMatcher({
        query: selInfo.text,
        caseSensitive: true,
        wholeWord: false,
        useRegex: false,
      });
      return res.ok ? res.matcher : null;
    }, [selInfo]);

    // All line indices that contain the selected text (literal, case-
    // sensitive), used by Ctrl/Cmd+D to cycle through occurrences.
    const selectionMatchLines = useMemo(() => {
      if (!selInfo?.text) return [] as number[];
      const idx: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(selInfo.text)) idx.push(i);
      }
      return idx;
    }, [lines, selInfo]);

    // Position the cursor at the line where the selection was made.
    useEffect(() => {
      if (!selInfo) {
        setSelMatchCursor(-1);
        return;
      }
      const pos = selectionMatchLines.indexOf(selInfo.line);
      setSelMatchCursor(pos >= 0 ? pos : 0);
    }, [selInfo, selectionMatchLines]);

    // Ctrl/Cmd+D: cycle to the next occurrence of the selected text and
    // scroll to that line. Wraps around at the end of the matches.
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (!active) return;
        const mod = e.metaKey || e.ctrlKey;
        if (!mod || e.key !== "d" || e.shiftKey) return;
        if (selectionMatchLines.length === 0) return;
        e.preventDefault();
        setSelMatchCursor((c) => {
          const next = c + 1 >= selectionMatchLines.length ? 0 : c + 1;
          scrollToLine(selectionMatchLines[next]);
          return next;
        });
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectionMatchLines, scrollToLine, active]);

    // When search opens (matcher prop becomes non-null), clear selection highlight
    // so the two highlight systems don't visually conflict.
    useEffect(() => {
      if (matcher) setSelInfo(null);
    }, [matcher]);

    // Combine search matcher and selection matcher into one.
    // Search takes precedence (opens the search bar → selection highlight suppressed).
    const effectiveMatcher: LineMatcher | null = useMemo(() => {
      if (matcher && !selectionMatcher) return matcher;
      if (!matcher && selectionMatcher) return selectionMatcher;
      if (matcher && selectionMatcher) {
        return (line: string) => {
          const r1 = matcher(line);
          const r2 = selectionMatcher(line);
          if (r1.length === 0) return r2;
          if (r2.length === 0) return r1;
          const merged = [...r1];
          for (const r of r2) {
            if (!merged.some((m) => r.start < m.end && r.end > m.start)) {
              merged.push(r);
            }
          }
          return merged.sort((a, b) => a.start - b.start);
        };
      }
      return null;
    }, [matcher, selectionMatcher]);

    const rows: React.ReactNode[] = [];
    const selCursorLine =
      selMatchCursor >= 0 && selMatchCursor < selectionMatchLines.length
        ? selectionMatchLines[selMatchCursor]
        : -1;
    for (let i = startIndex; i < endIndex; i++) {
      const lineIndex = geo.visibleLineIndexes[i];
      const restore: RestoreSelection | null =
        selInfo && selInfo.line === lineIndex
          ? { startOffset: selInfo.startOffset, length: selInfo.length }
          : null;
      rows.push(
        <LogLine
          key={lineIndex}
          line={lines[lineIndex]}
          lineNumber={lineIndex + 1}
          lineIndex={lineIndex}
          matcher={effectiveMatcher}
          lineNumberWidth={geo.lineNumberWidth}
          isCurrent={currentLine === lineIndex || selCursorLine === lineIndex}
          top={geo.prefixSum[i]}
          height={geo.prefixSum[i + 1] - geo.prefixSum[i]}
          restoreSelection={restore}
        />
      );
    }

    return (
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onDoubleClick={handleDoubleClick}
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
        {tsTooltip && (
          <div
            style={{
              position: "absolute",
              left: tsTooltip.left,
              top: tsTooltip.top,
              transform: "translateX(-50%)",
              background: "#333",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: 13,
              fontFamily: "'Cascadia Code', Consolas, monospace",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 100,
            }}
          >
            {tsTooltip.text}
          </div>
        )}
      </div>
    );
  }
);

LogViewer.displayName = "LogViewer";

export default LogViewer;

function findNearestVisibleIndex(lineIndex: number, originalToVisibleIndex: number[]): number {
  const exact = originalToVisibleIndex[lineIndex];
  if (exact >= 0) return exact;

  for (let i = lineIndex + 1; i < originalToVisibleIndex.length; i++) {
    if (originalToVisibleIndex[i] >= 0) return originalToVisibleIndex[i];
  }

  for (let i = lineIndex - 1; i >= 0; i--) {
    if (originalToVisibleIndex[i] >= 0) return originalToVisibleIndex[i];
  }

  return -1;
}
