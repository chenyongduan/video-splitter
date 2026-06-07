import React, { useCallback } from "react";
import { message } from "antd";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../store/segmentStore";
import JsonToolbar from "./JsonToolbar";
import JsonTreeView from "./JsonTreeView";
import type { VisibleLine } from "../../types";

const JsonPage: React.FC = () => {
  const { isJsonLoaded, setJsonFile } = useAppStore();

  const handleFileDrop = useCallback(
    async (paths: string[]) => {
      const path = paths[0];
      if (!path.toLowerCase().endsWith(".json") && !path.toLowerCase().endsWith(".replay")) {
        message.warning("请拖入 JSON 文件");
        return;
      }
      try {
        const fileName = path.split(/[\\/]/).pop() || path;
        const [total, firstPage] = await invoke<[number, VisibleLine[]]>(
          "json_open_file",
          { path }
        );
        setJsonFile(path, fileName, total, firstPage);
      } catch (e) {
        message.error(`打开文件失败: ${e}`);
      }
    },
    [setJsonFile]
  );

  React.useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        handleFileDrop(event.payload.paths);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleFileDrop]);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <JsonToolbar />
      {isJsonLoaded ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <JsonTreeView />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <div
            style={{
              width: 320,
              height: 200,
              border: "2px dashed #d9d9d9",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              fontSize: 16,
            }}
          >
            <span style={{ fontSize: 40 }}>📄</span>
            <span>拖拽 JSON 文件到此处</span>
            <span style={{ fontSize: 13, color: "#bbb" }}>
              或使用顶部「选择文件」按钮
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonPage;
