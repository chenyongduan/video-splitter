import React, { useState } from "react";
import { Button, Slider, Typography, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { compressImage, getImageInfo } from "../../utils/image";

const { Text } = Typography;

const ImageCompressor: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);

  const [quality, setQuality] = useState(80);
  const [loading, setLoading] = useState(false);

  const handleCompress = async () => {
    if (!imagePath || !imageInfo) return;

    try {
      const ext = imagePath.split(".").pop() || "png";
      const defaultName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") +
        "_compressed." +
        ext;

      const outputPath = await save({
        defaultPath: defaultName,
        filters: [{ name: "图片文件", extensions: [ext] }],
      });

      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      await compressImage(imagePath, outputPath, { quality });

      const outputInfo = await getImageInfo(outputPath);

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat: imageInfo.format,
        inputSize: imageInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        taskType: "compress",
      });

      message.success("压缩完成");
    } catch (err) {
      message.error(`压缩失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>
          压缩质量：
        </Text>
        <Slider
          min={1}
          max={100}
          value={quality}
          onChange={setQuality}
          style={{ flex: 1 }}
        />
        <Text strong style={{ minWidth: 40, textAlign: "right" }}>
          {quality}%
        </Text>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 8,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <Button type="primary" loading={loading} onClick={handleCompress}>
          开始压缩
        </Button>
      </div>
    </div>
  );
};

export default ImageCompressor;
