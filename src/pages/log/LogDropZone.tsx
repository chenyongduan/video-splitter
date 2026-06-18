import React, { useCallback, useEffect, useState } from "react";
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
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          padding: "72px 0",
          textAlign: "center",
          cursor: "pointer",
          borderRadius: 12,
          border: `2px dashed ${isDragOver ? "#1890ff" : "#d9d9d9"}`,
          background: isDragOver ? "#e6f7ff" : "transparent",
          transition: "all 0.3s",
        }}
      >
        <InboxOutlined
          style={{ fontSize: 56, color: isDragOver ? "#1890ff" : "#999" }}
        />
        <p style={{ fontSize: 16, marginTop: 16, margin: 0 }}>
          拖拽日志文件到此处，或点击选择文件
        </p>
        <p style={{ color: "#999", marginTop: 8, margin: 0 }}>
          支持 .log / .txt 等文本文件
        </p>
      </div>
    </div>
  );
};

export default LogDropZone;
