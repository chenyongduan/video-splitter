import React, { useMemo, useLayoutEffect, useRef } from "react";
import { highlightSegments, type LineMatcher } from "./highlight";

export const LINE_HEIGHT = 20;
export const LOG_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const LOG_FONT_SIZE = 13;

export interface RestoreSelection {
  startOffset: number;
  length: number;
}

interface LogLineProps {
  line: string;
  lineNumber: number; // 1-based
  lineIndex: number; // 0-based, used for data-line-idx
  matcher: LineMatcher | null;
  lineNumberWidth: number;
  isCurrent: boolean;
  top: number;
  height: number;
  restoreSelection?: RestoreSelection | null;
}

const LogLine: React.FC<LogLineProps> = ({
  line,
  lineNumber,
  lineIndex,
  matcher,
  lineNumberWidth,
  isCurrent,
  top,
  height,
  restoreSelection,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const segments = useMemo(
    () => highlightSegments(line, matcher),
    [line, matcher]
  );

  // Restore the browser selection after React re-renders the text nodes
  // (wrapping matched text in <mark> replaces the original text nodes,
  // which makes the browser lose the selection anchor/focus).
  // useLayoutEffect fires after DOM mutations but BEFORE paint, so the
  // user never sees the selection disappear.
  useLayoutEffect(() => {
    if (!restoreSelection || !contentRef.current) return;
    const { startOffset, length } = restoreSelection;
    if (length <= 0) return;

    const endOffset = startOffset + length;
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT
    );

    let pos = 0;
    let startNode: Node | null = null;
    let startNodeOffset = 0;
    let endNode: Node | null = null;
    let endNodeOffset = 0;

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const nodeLen = (node.textContent ?? "").length;
      if (!startNode && pos + nodeLen >= startOffset) {
        startNode = node;
        startNodeOffset = startOffset - pos;
      }
      if (!endNode && pos + nodeLen >= endOffset) {
        endNode = node;
        endNodeOffset = endOffset - pos;
        break;
      }
      pos += nodeLen;
    }

    if (startNode && endNode) {
      try {
        const range = document.createRange();
        range.setStart(startNode, startNodeOffset);
        range.setEnd(endNode, endNodeOffset);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // Silently ignore invalid ranges (e.g. offset past node length)
      }
    }
  }, [restoreSelection]);

  return (
    <div
      data-line-idx={lineIndex}
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
        ref={contentRef}
        data-content="1"
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
