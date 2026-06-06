import React, { useState } from "react";
import { Button, Select, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { convertImage, getImageInfo } from "../../utils/image";

const OUTPUT_FORMATS = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "bmp", label: "BMP" },
  { value: "ico", label: "ICO" },
];

const ImageConverter: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);

  const [outputFormat, setOutputFormat] = useState("png");
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    if (!imagePath || !imageInfo) return;

    // 如果格式相同则提示
    if (outputFormat === imageInfo.format) {
      message.warning("输出格式与原格式相同，请选择其他格式");
      return;
    }

    try {
      const defaultName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") +
        "." +
        outputFormat;

      const outputPath = await save({
        defaultPath: defaultName,
        filters: [{ name: "图片文件", extensions: [outputFormat] }],
      });

      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      await convertImage(imagePath, outputPath, { outputFormat });

      const outputInfo = await getImageInfo(outputPath);

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat,
        inputSize: imageInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        taskType: "convert",
      });

      message.success("格式转换完成");
    } catch (err) {
      message.error(`格式转换失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 13, color: "#666" }}>目标格式：</span>
      <Select
        value={outputFormat}
        onChange={setOutputFormat}
        style={{ width: 120 }}
        options={OUTPUT_FORMATS}
      />
      <div style={{ flex: 1 }} />
      <Button type="primary" loading={loading} onClick={handleConvert}>
        开始转换
      </Button>
    </div>
  );
};

export default ImageConverter;
