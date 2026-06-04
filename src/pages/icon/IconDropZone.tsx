import React, { useCallback, useEffect, useState } from "react";
import { Card, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getImageInfo } from "../../utils/image";
import { useAppStore } from "../../store/segmentStore";

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg"];

const IconDropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const setIconFile = useAppStore((s) => s.setIconFile);

  const loadIconFile = useCallback(
    async (filePath: string) => {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        message.error("只支持 512×512 或 1024×1024 的 PNG、JPG 格式");
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "icon.png";

      try {
        const info = await getImageInfo(filePath);

        if (info.width !== info.height || (info.width !== 512 && info.width !== 1024)) {
          message.error("只支持 512×512 或 1024×1024 的 PNG、JPG 格式");
          return;
        }

        setIconFile(filePath, fileName, {
          width: info.width,
          height: info.height,
          format: info.format,
          fileSize: info.fileSize,
        });
      } catch (err) {
        message.error("只支持 512×512 或 1024×1024 的 PNG、JPG 格式");
      }
    },
    [setIconFile],
  );

  const handleSelectFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片文件",
            extensions: ALLOWED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;
      await loadIconFile(selected as string);
    } catch (err) {
      message.error(`选择文件失败: ${err}`);
    }
  }, [loadIconFile]);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          loadIconFile(files[0]);
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
  }, [loadIconFile]);

  return (
    <Card style={{ marginTop: 48 }}>
      <div
        onClick={handleSelectFile}
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
          style={{ fontSize: 48, color: isDragOver ? "#1890ff" : "#999" }}
        />
        <p style={{ fontSize: 16, marginTop: 16 }}>
          拖拽图片到此处，或点击选择文件
        </p>
        <p style={{ color: "#999" }}>
          只支持 512×512 或 1024×1024 的 PNG、JPG 格式
        </p>
      </div>
    </Card>
  );
};

export default IconDropZone;
