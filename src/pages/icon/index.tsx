import React, { useCallback } from "react";
import { Button, Space, Typography, Spin, Tag, message, Slider } from "antd";
import {
  DeleteOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import { formatFileSize } from "../../utils/format";
import { getImageInfo } from "../../utils/image";
import IconDropZone from "./IconDropZone";
import IconExporter from "./IconExporter";

const { Text } = Typography;

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg"];

const IconPage: React.FC = () => {
  const isIconLoaded = useAppStore((s) => s.isIconLoaded);
  const iconFileName = useAppStore((s) => s.iconFileName);
  const iconPath = useAppStore((s) => s.iconPath);
  const iconInfo = useAppStore((s) => s.iconInfo);
  const isIconProcessing = useAppStore((s) => s.isIconProcessing);
  const clearIcon = useAppStore((s) => s.clearIcon);
  const setIconFile = useAppStore((s) => s.setIconFile);
  const iconCornerRadius = useAppStore((s) => s.iconCornerRadius);
  const setIconCornerRadius = useAppStore((s) => s.setIconCornerRadius);
  const iconPadding = useAppStore((s) => s.iconPadding);
  const setIconPadding = useAppStore((s) => s.setIconPadding);

  const handleLoadImage = useCallback(async () => {
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

      const filePath = selected as string;
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        message.error("只支持 512×512 或 1024×1024 的 PNG、JPG 格式");
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "icon.png";
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
  }, [setIconFile]);

  if (!isIconLoaded) {
    return (
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <IconDropZone />
      </div>
    );
  }

  const src = convertFileSrc(iconPath);

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text strong ellipsis style={{ maxWidth: 600 }}>
            {iconFileName}
          </Text>
          {iconInfo && (
            <>
              <Tag color="blue">
                {iconInfo.width}×{iconInfo.height}
              </Tag>
              <Tag color="blue">
                {iconInfo.format.toUpperCase()}
              </Tag>
              <Tag color="orange">
                {formatFileSize(iconInfo.fileSize)}
              </Tag>
            </>
          )}
        </div>
        <Space>
          <Button icon={<FolderOpenOutlined />} onClick={handleLoadImage}>
            选择图片
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={clearIcon}>
            清空
          </Button>
        </Space>
      </div>

      {/* Image Preview */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "12px 0",
          marginBottom: 12,
          background: "#fafafa",
          borderRadius: 8,
        }}
      >
        {(() => {
          const previewSize = 200;
          const paddingPx = (iconPadding / 100) * previewSize;
          const innerSize = previewSize - paddingPx * 2;
          const radiusPx = (iconCornerRadius / 100) * innerSize;
          return (
            <div style={{ width: previewSize, height: previewSize, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: paddingPx,
                  top: paddingPx,
                  width: innerSize,
                  height: innerSize,
                  borderRadius: radiusPx,
                  overflow: "hidden",
                }}
              >
                <img
                  src={src}
                  alt="预览"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Corner Radius Control */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, color: "#666", minWidth: 72 }}>
          圆角半径：
        </span>
        <Slider
          min={0}
          max={50}
          value={iconCornerRadius}
          onChange={setIconCornerRadius}
          style={{ flex: 1 }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {iconCornerRadius}%
        </span>
      </div>

      {/* Padding Control */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, color: "#666", minWidth: 72 }}>
          图片边距：
        </span>
        <Slider
          min={0}
          max={10}
          step={0.5}
          value={iconPadding}
          onChange={setIconPadding}
          style={{ flex: 1 }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {iconPadding}%
        </span>
      </div>

      {/* Export Panel */}
      <Spin spinning={isIconProcessing} tip="导出中...">
        <IconExporter />
      </Spin>
    </div>
  );
};

export default IconPage;
