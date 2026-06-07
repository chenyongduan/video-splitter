import React, { useState } from "react";
import { Input, message } from "antd";
import {
  CaretRightOutlined,
  CaretDownOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import type { JsonNode, VisibleLine } from "../../types";

const JsonTreeView: React.FC = () => {
  const {
    jsonVisibleLines,
    jsonValidationError,
    setJsonTree,
    setJsonVisibleLines,
  } = useAppStore();

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleToggleCollapse = async (nodePath: string) => {
    try {
      const lines = await invoke<VisibleLine[]>("json_toggle_collapse", {
        nodePath,
      });
      setJsonVisibleLines(lines);
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
      const [tree, lines] = await invoke<[JsonNode, VisibleLine[]]>(
        "json_update_node",
        { nodePath: editingPath, newValue: editValue }
      );
      setJsonTree(tree, lines);
      setEditingPath(null);
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

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        fontFamily:
          "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
        fontSize: 13,
        lineHeight: "22px",
        background: "#fafafa",
      }}
    >
      {jsonVisibleLines.map((line) => {
        const isError =
          errorLine !== null && line.line_number === errorLine;
        return (
          <div
            key={line.line_number}
            style={{
              display: "flex",
              minHeight: 22,
              background: isError ? "#fff2f0" : "transparent",
              borderBottom: isError ? "1px solid #ffccc7" : "none",
            }}
          >
            {/* Line number */}
            <div
              style={{
                width: 50,
                minWidth: 50,
                textAlign: "right",
                paddingRight: 12,
                color: "#999",
                userSelect: "none",
                borderRight: "1px solid #e8e8e8",
              }}
            >
              {line.line_number}
            </div>

            {/* Collapse icon */}
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

            {/* Content */}
            <div
              style={{
                flex: 1,
                paddingLeft: 4,
                display: "flex",
                alignItems: "center",
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
                  <span style={{ whiteSpace: "pre" }}>
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
  );
};

function renderLineContent(line: VisibleLine): React.ReactNode {
  const colonIdx = line.content.indexOf(": ");
  if (colonIdx < 0) {
    return <span style={{ color: "#333" }}>{line.content}</span>;
  }
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
