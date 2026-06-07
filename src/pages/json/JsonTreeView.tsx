import React, { useState, useRef, useEffect, useCallback } from "react";
import { Input, message } from "antd";
import {
  CaretRightOutlined,
  CaretDownOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import type { VisibleLine } from "../../types";

const LINE_HEIGHT = 22;
const BUFFER = 30;
const FETCH_SIZE = 200;

const JsonTreeView: React.FC = () => {
  const {
    jsonTotalLines,
    jsonFetchedLines,
    jsonFetchStart,
    jsonValidationError,
    setJsonLines,
  } = useAppStore();

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(600);

  // Timestamp tooltip state
  const [tsTooltip, setTsTooltip] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);
  const tsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Virtual scroll: which lines are in the viewport
  const viewStart = Math.floor(scrollTop / LINE_HEIGHT);
  const viewEnd = viewStart + Math.ceil(viewHeight / LINE_HEIGHT);

  // Fetch lines from Rust when viewport changes
  const fetchLines = useCallback(async (start: number) => {
    try {
      const lines = await invoke<VisibleLine[]>("json_get_lines", {
        start,
        count: FETCH_SIZE,
      });
      const total = useAppStore.getState().jsonTotalLines;
      setJsonLines(total, lines, start);
    } catch {
      // ignore fetch errors during scroll
    }
  }, [setJsonLines]);

  // Determine if we need to re-fetch (viewport moved outside fetched range)
  const fetchStart = jsonFetchStart;
  const fetchEnd = fetchStart + jsonFetchedLines.length;
  const needsFetch = viewStart < fetchStart || viewEnd > fetchEnd;

  useEffect(() => {
    if (needsFetch && jsonTotalLines > 0) {
      const newStart = Math.max(0, viewStart - BUFFER);
      fetchLines(newStart);
    }
  }, [needsFetch, viewStart, viewEnd, jsonTotalLines, fetchLines]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (tsTimerRef.current) clearTimeout(tsTimerRef.current);
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
    setTsTooltip(null);
  }, []);

  const handleDoubleClick = useCallback((_e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selected = selection.toString().trim();
    const date = tryParseTimestamp(selected);
    if (!date) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    setTsTooltip({
      text: formatTimestamp(date),
      left: rect.left + rect.width / 2 - containerRect.left,
      top: rect.top - containerRect.top - 40 + containerRef.current!.scrollTop,
    });

    if (tsTimerRef.current) clearTimeout(tsTimerRef.current);
    tsTimerRef.current = setTimeout(() => setTsTooltip(null), 5000);
  }, []);

  const handleToggleCollapse = async (nodePath: string) => {
    try {
      // Remember current scroll position
      const currentScroll = containerRef.current?.scrollTop ?? 0;
      const currentStart = Math.max(0, Math.floor(currentScroll / LINE_HEIGHT) - BUFFER);

      // Toggle collapse - only need the new total
      const [total] = await invoke<[number, VisibleLine[]]>(
        "json_toggle_collapse",
        { nodePath }
      );

      // Fetch lines around current scroll position
      const lines = await invoke<VisibleLine[]>("json_get_lines", {
        start: currentStart,
        count: FETCH_SIZE,
      });

      setJsonLines(total, lines, currentStart);
      // Restore scroll position
      if (containerRef.current) containerRef.current.scrollTop = currentScroll;
    } catch (e) {
      message.error(`折叠操作失败: ${e}`);
    }
  };

  const handleStartEdit = (nodePath: string, currentValue: string) => {
    setEditingPath(nodePath);
    setEditValue(currentValue);
  };

  const handleConfirmEdit = async () => {
    if (!editingPath) return;
    try {
      const currentScroll = containerRef.current?.scrollTop ?? 0;
      const currentStart = Math.max(0, Math.floor(currentScroll / LINE_HEIGHT) - BUFFER);

      const [total] = await invoke<[number, VisibleLine[]]>(
        "json_update_node",
        { nodePath: editingPath, newValue: editValue }
      );

      const lines = await invoke<VisibleLine[]>("json_get_lines", {
        start: currentStart,
        count: FETCH_SIZE,
      });

      setJsonLines(total, lines, currentStart);
      setEditingPath(null);
      if (containerRef.current) containerRef.current.scrollTop = currentScroll;
    } catch (e) {
      message.error(`编辑失败: ${e}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingPath(null);
    setEditValue("");
  };

  const errorLine =
    jsonValidationError && !jsonValidationError.valid
      ? jsonValidationError.error_line
      : null;

  const totalHeight = jsonTotalLines * LINE_HEIGHT;

  // Slice the fetched lines to only what's visible in the viewport
  const renderStart = Math.max(fetchStart, viewStart - BUFFER);
  const renderEnd = Math.min(fetchEnd, viewEnd + BUFFER);
  const sliceOffset = renderStart - fetchStart;

  const visibleSlice =
    sliceOffset >= 0 && sliceOffset < jsonFetchedLines.length
      ? jsonFetchedLines.slice(
          sliceOffset,
          sliceOffset + (renderEnd - renderStart)
        )
      : [];

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onDoubleClick={handleDoubleClick}
      style={{
        flex: 1,
        overflow: "auto",
        fontFamily:
          "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
        fontSize: 13,
        lineHeight: `${LINE_HEIGHT}px`,
        background: "#fafafa",
        position: "relative",
      }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: renderStart * LINE_HEIGHT,
            left: 0,
            right: 0,
          }}
        >
          {visibleSlice.map((line) => {
            const isError =
              errorLine !== null && line.line_number === errorLine;
            return (
              <div
                key={line.line_number}
                style={{
                  display: "flex",
                  minHeight: LINE_HEIGHT,
                  background: isError ? "#fff2f0" : "transparent",
                  borderBottom: isError ? "1px solid #ffccc7" : "none",
                }}
              >
                <div
                  style={{
                    minWidth: 50,
                    textAlign: "right",
                    paddingLeft: 8,
                    paddingRight: 8,
                    color: "#999",
                    userSelect: "none",
                    borderRight: "1px solid #e8e8e8",
                  }}
                >
                  {line.line_number}
                </div>

                <div
                  style={{
                    width: 20,
                    minWidth: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {line.is_collapsible && (
                    <span
                      onClick={() => handleToggleCollapse(line.node_path)}
                      style={{ cursor: "pointer", color: "#666" }}
                    >
                      {line.collapsed ? (
                        <CaretRightOutlined style={{ fontSize: 10 }} />
                      ) : (
                        <CaretDownOutlined style={{ fontSize: 10 }} />
                      )}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    paddingLeft: 4,
                    display: "flex",
                    alignItems: "flex-end",
                    paddingBottom: 2,
                    overflow: "hidden",
                  }}
                >
                  {editingPath === line.node_path && line.is_editable ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Input
                        size="small"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onPressEnter={handleConfirmEdit}
                        onBlur={handleConfirmEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        style={{ width: 300, fontFamily: "inherit", fontSize: 13 }}
                        autoFocus
                      />
                    </span>
                  ) : (
                    <>
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {renderLineContent(line)}
                      </span>
                      {line.is_editable && (
                        <EditOutlined
                          style={{
                            marginLeft: 8,
                            color: "#bbb",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                          onClick={() =>
                            handleStartEdit(line.node_path, extractRawValue(line))
                          }
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timestamp tooltip */}
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
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {tsTooltip.text}
          <div
            style={{
              position: "absolute",
              bottom: -5,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 8,
              height: 8,
              background: "#333",
            }}
          />
        </div>
      )}
    </div>
  );
};

function tryParseTimestamp(text: string): Date | null {
  const cleaned = text.replace(/["',]/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num) || cleaned.length === 0) return null;
  if (cleaned.length === 13 && num >= 1e12 && num < 1e14) return new Date(num);
  if (cleaned.length >= 9 && cleaned.length <= 10 && num >= 1e9 && num < 1e10)
    return new Date(num * 1000);
  return null;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function renderLineContent(line: VisibleLine): React.ReactNode {
  const colonIdx = line.content.indexOf(": ");

  if (colonIdx >= 0) {
    const keyPart = line.content.slice(0, colonIdx);
    const valuePart = line.content.slice(colonIdx + 2);
    return (
      <>
        <span style={{ color: "#a31515" }}>{keyPart}</span>
        <span style={{ color: "#333" }}>{": "}</span>
        <span style={{ color: getValueColor(valuePart) }}>{valuePart}</span>
      </>
    );
  }

  const content = line.content;
  const trimStart = content.length - content.trimStart().length;
  const indent = content.slice(0, trimStart);
  const value = content.slice(trimStart);

  if (indent.length > 0) {
    return (
      <>
        <span style={{ color: "#333" }}>{indent}</span>
        <span style={{ color: getValueColor(value) }}>{value}</span>
      </>
    );
  }

  return <span style={{ color: getValueColor(value) }}>{value}</span>;
}

function getValueColor(value: string): string {
  if (value.startsWith('"')) return "#0b8a0b";
  if (value === "true" || value === "false") return "#0550ae";
  if (value === "null") return "#8b949e";
  if (/^[-]?\d/.test(value)) return "#098658";
  return "#333";
}

function extractRawValue(line: VisibleLine): string {
  const colonIdx = line.content.indexOf(": ");
  if (colonIdx < 0) return line.content;
  return line.content.slice(colonIdx + 2);
}

export default JsonTreeView;
