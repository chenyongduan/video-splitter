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
import { tryParseTimestamp, formatTimestamp } from "../../utils/timestamp";

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
    const [containerHeight, setContainerHeight] = useState(0);

    // Timestamp tooltip state
    const [tsTooltip, setTsTooltip] = useState<{
      text: string;
      left: number;
      top: number;
    } | null>(null);
    const tsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const charWidth = useMemo(() => measureCharWidth(), []);

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

    const viewportHeight = containerHeight;

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
