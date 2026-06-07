import React, { useRef, useCallback } from "react";
import { CloseOutlined } from "@ant-design/icons";
import type { SearchResult } from "../../types";

interface JsonSearchResultsProps {
  results: SearchResult[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  panelHeight: number;
  onHeightChange: (height: number) => void;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 400;

const JsonSearchResults: React.FC<JsonSearchResultsProps> = ({
  results,
  currentIndex,
  onSelect,
  onClose,
  panelHeight,
  onHeightChange,
}) => {
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = panelHeight;

      const handleMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = startYRef.current - ev.clientY;
        const newHeight = Math.min(
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, startHeightRef.current + delta)
        );
        onHeightChange(newHeight);
      };

      const handleUp = () => {
        draggingRef.current = false;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [panelHeight, onHeightChange]
  );

  if (results.length === 0) return null;

  const renderContent = (result: SearchResult) => {
    const { content, match_start, match_end } = result;
    const before = content.slice(0, match_start);
    const match = content.slice(match_start, match_end);
    const after = content.slice(match_end);

    const truncatedBefore =
      before.length > 30 ? "..." + before.slice(-30) : before;
    const truncatedAfter =
      after.length > 50 ? after.slice(0, 50) + "..." : after;

    return (
      <span>
        <span style={{ color: "#999" }}>{truncatedBefore}</span>
        <span style={{ background: "#ffe58f", color: "#333" }}>{match}</span>
        <span style={{ color: "#666" }}>{truncatedAfter}</span>
      </span>
    );
  };

  return (
    <div
      style={{
        height: panelHeight,
        background: "rgba(255,255,255,0.97)",
        borderTop: "1px solid #e8e8e8",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 4,
          cursor: "ns-resize",
          background: "#e8e8e8",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.background = "#bbb";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.background = "#e8e8e8";
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 12px",
          borderBottom: "1px solid #f0f0f0",
          fontSize: 12,
          color: "#666",
          flexShrink: 0,
        }}
      >
        <span>搜索结果: {results.length} 项匹配</span>
        <CloseOutlined
          style={{ cursor: "pointer", fontSize: 12 }}
          onClick={onClose}
        />
      </div>

      {/* Results list */}
      <div style={{ flex: 1, overflow: "auto", fontSize: 12 }}>
        {results.map((result, idx) => {
          const isCurrent = idx === currentIndex;
          const isHidden = result.visible_line === 0;
          return (
            <div
              key={idx}
              onClick={() => onSelect(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "3px 12px",
                cursor: "pointer",
                background: isCurrent ? "#e6f4ff" : "transparent",
                opacity: isHidden ? 0.5 : 1,
                borderBottom: "1px solid #f5f5f5",
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLElement).style.background = "#fafafa";
                }
              }}
              onMouseLeave={(e) => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }
              }}
            >
              <span
                style={{
                  minWidth: 40,
                  color: "#999",
                  fontSize: 11,
                  fontFamily: "'Cascadia Code', Consolas, monospace",
                  textAlign: "right" as const,
                  marginRight: 8,
                  flexShrink: 0,
                }}
              >
                {isHidden ? "…" : result.visible_line}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                  fontFamily: "'Cascadia Code', Consolas, monospace",
                }}
              >
                {renderContent(result)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JsonSearchResults;
