import React, { useCallback, useEffect, useState } from "react";
import { Card } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface LogDropZoneProps {
  onOpenFile: (path: string) => void;
  onPickFile: () => void;
}

const LogDropZone: React.FC<LogDropZoneProps> = ({ onOpenFile, onPickFile }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          onOpenFile(files[0]);
        }
      } else if (event.payload.type === "over") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onOpenFile]);

  const handleClick = useCallback(() => {
    onPickFile();
  }, [onPickFile]);

  return (
    <div
      onClick={handleClick}
      style={{
        padding: 16,
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
      }}
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
            拖拽日志文件到此处，或点击选择文件
          </p>
          <p style={{ color: "#999" }}>
            支持 .log / .txt 等文本文件
          </p>
        </div>
      </Card>
    </div>
  );
};

export default LogDropZone;
