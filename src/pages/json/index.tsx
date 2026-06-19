import React, { useCallback, useState } from "react";
import { Card, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import JsonToolbar from "./JsonToolbar";
import JsonTreeView from "./JsonTreeView";
import type { VisibleLine } from "../../types";

const JsonPage: React.FC = () => {
  const { isJsonLoaded, setJsonFile } = useAppStore();
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handlePickFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json", "replay"] }],
      });
      if (!selected) return;
      await handleFileDrop([selected as string]);
    } catch (e) {
      message.error(`打开文件失败: ${e}`);
    }
  }, [handleFileDrop]);

  React.useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        handleFileDrop(event.payload.paths);
      } else if (event.payload.type === "over") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
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
      {isJsonLoaded ? (
        <>
          <JsonToolbar />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <JsonTreeView />
          </div>
        </>
      ) : (
        <div
          style={{
            flex: 1,
            padding: 16,
            maxWidth: 960,
            margin: "0 auto",
            width: "100%",
          }}
          onClick={handlePickFile}
          onDragOver={(e) => e.preventDefault()}
        >
          <Card style={{ marginTop: 48 }}>
            <div
              style={{
                padding: "60px 0",
                textAlign: "center",
                cursor: "pointer",
                borderRadius: 8,
                border: `2px dashed ${isDragOver ? "#1890ff" : "#d9d9d9"}`,
                background: isDragOver ? "#e6f7ff" : "transparent",
                transition: "all 0.3s",
              }}
            >
              <InboxOutlined
                style={{
                  fontSize: 48,
                  color: isDragOver ? "#1890ff" : "#999",
                }}
              />
              <p style={{ fontSize: 16, marginTop: 16 }}>
                拖拽 JSON 文件到此处，或点击选择文件
              </p>
              <p style={{ color: "#999" }}>
                支持 JSON, Replay 格式
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default JsonPage;
