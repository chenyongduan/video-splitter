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
