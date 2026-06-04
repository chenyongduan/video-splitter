import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getImageInfo } from "../../utils/image";
import { useAppStore } from "../../store/segmentStore";

const SUPPORTED_IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "ico",
  "tiff",
  "gif",
];

const ImageDropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const setImageFile = useAppStore((s) => s.setImageFile);

  const loadImageFile = useCallback(
    async (filePath: string) => {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
        message.error(
          `不支持的格式: .${ext}，仅支持 ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`,
        );
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "image.png";

      try {
        const info = await getImageInfo(filePath);
        setImageFile(filePath, fileName, info);
      } catch (err) {
        message.error(`加载失败: ${err}，文件可能已损坏`);
      }
    },
    [setImageFile],
  );

  const handleSelectFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片文件",
            extensions: SUPPORTED_IMAGE_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;
      await loadImageFile(selected as string);
    } catch (err) {
      message.error(`选择文件失败: ${err}`);
    }
  }, [loadImageFile]);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          loadImageFile(files[0]);
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
  }, [loadImageFile]);

  return (
    <Card style={{ marginTop: 48 }}>
      <div
        ref={dropRef}
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
          拖拽图片文件到此处，或点击选择文件
        </p>
        <p style={{ color: "#999" }}>
          支持 PNG、JPG、WebP、BMP、ICO、TIFF、GIF 格式
        </p>
      </div>
    </Card>
  );
};

export default ImageDropZone;
