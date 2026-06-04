import React from "react";
import { useAppStore } from "../../store/segmentStore";
import { formatFileSize } from "../../utils/format";

const ImageMetadata: React.FC = () => {
  const imageInfo = useAppStore((s) => s.imageInfo);

  if (!imageInfo) return null;

  const items = [
    { label: "尺寸", value: `${imageInfo.width} × ${imageInfo.height}` },
    { label: "格式", value: imageInfo.format.toUpperCase() },
    { label: "文件大小", value: formatFileSize(imageInfo.fileSize) },
    { label: "色彩模式", value: imageInfo.colorMode },
    { label: "位深", value: `${imageInfo.bitDepth} bit` },
  ];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: "8px 16px",
        marginBottom: 12,
        border: "1px solid #e8e8e8",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
        }}
      >
        {items.map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageMetadata;
