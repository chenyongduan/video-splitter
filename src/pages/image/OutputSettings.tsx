import React, { useMemo, useState } from "react";
import {
  Button,
  InputNumber,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
  message,
} from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import {
  getEditedDimensions,
  getImageInfo,
  processImage,
  resolveImageProcessParams,
} from "../../utils/image";
import type { ImageOutputFormat } from "../../types";

const { Text } = Typography;

const FORMAT_OPTIONS: { value: ImageOutputFormat; label: string }[] = [
  { value: "original", label: "保持原格式" },
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "bmp", label: "BMP" },
  { value: "ico", label: "ICO" },
  { value: "tiff", label: "TIFF" },
  { value: "gif", label: "GIF" },
];

/**
 * 导出设置：尺寸 / 格式 / 质量 + 导出按钮。
 * 编辑状态（旋转/翻转/裁剪）来自 store，一次 FFmpeg 完成全部操作。
 */
const OutputSettings: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const rotation = useAppStore((s) => s.imageRotation);
  const flipH = useAppStore((s) => s.imageFlipH);
  const flipV = useAppStore((s) => s.imageFlipV);
  const cropRect = useAppStore((s) => s.imageCropRect);
  const padding = useAppStore((s) => s.imagePadding);
  const paddingColor = useAppStore((s) => s.imagePaddingColor);
  const output = useAppStore((s) => s.imageOutput);
  const setOutput = useAppStore((s) => s.setImageOutput);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);

  const [loading, setLoading] = useState(false);

  // 编辑后（旋转+裁剪+内边距）尺寸
  const edited = useMemo(
    () =>
      imageInfo
        ? getEditedDimensions(imageInfo, rotation, cropRect, padding)
        : null,
    [imageInfo, rotation, cropRect, padding]
  );

  const resolvedFormat =
    output.format === "original" ? imageInfo?.format : output.format;
  const showQuality = resolvedFormat === "jpg" || resolvedFormat === "webp";
  const isPng = resolvedFormat === "png";

  const handleWidthChange = (val: number | null) => {
    if (val === null || !edited) return;
    if (output.lockAspectRatio && edited.width > 0) {
      const h = Math.max(1, Math.round((val / edited.width) * edited.height));
      setOutput({ width: val, height: h });
    } else {
      setOutput({ width: val });
    }
  };

  const handleHeightChange = (val: number | null) => {
    if (val === null || !edited) return;
    if (output.lockAspectRatio && edited.height > 0) {
      const w = Math.max(1, Math.round((val / edited.height) * edited.width));
      setOutput({ width: w, height: val });
    } else {
      setOutput({ height: val });
    }
  };

  const handleExport = async () => {
    if (!imagePath || !imageInfo || !edited) return;

    // 校验
    if (output.sizeMode === "custom") {
      if (output.lockAspectRatio && output.width <= 0) {
        message.warning("请输入有效的宽度");
        return;
      }
      if (!output.lockAspectRatio && (output.width <= 0 || output.height <= 0)) {
        message.warning("请输入有效的宽度和高度");
        return;
      }
    }
    if (output.sizeMode === "percent" && output.scalePercent <= 0) {
      message.warning("请输入有效的缩放百分比");
      return;
    }

    try {
      const baseName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "image";
      const ext = resolvedFormat || "png";

      const outputPath = await save({
        defaultPath: `${baseName}_edited.${ext}`,
        filters: [{ name: "图片文件", extensions: [ext] }],
      });
      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      const params = resolveImageProcessParams(
        imageInfo,
        { rotation, flipH, flipV, crop: cropRect, padding, paddingColor },
        output
      );
      await processImage(imagePath, outputPath, params);

      const outputInfo = await getImageInfo(outputPath);

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat: params.format,
        inputSize: imageInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${outputInfo.width}×${outputInfo.height}`,
        taskType: "export",
      });

      message.success("导出完成");
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 尺寸 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>输出尺寸：</Text>
        <Segmented
          value={output.sizeMode}
          onChange={(v) => setOutput({ sizeMode: v as typeof output.sizeMode })}
          options={[
            { value: "auto", label: "跟随编辑" },
            { value: "percent", label: "按百分比" },
            { value: "custom", label: "自定义" },
          ]}
        />
        {edited && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            编辑后 {edited.width}×{edited.height}
          </Text>
        )}
        {output.sizeMode === "percent" && (
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>百分比：</Text>
            <InputNumber
              min={1}
              max={1000}
              value={output.scalePercent}
              onChange={(v) => setOutput({ scalePercent: v ?? 100 })}
              style={{ width: 100 }}
              addonAfter="%"
            />
          </Space>
        )}
        {output.sizeMode === "custom" && (
          <>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>宽度：</Text>
              <InputNumber
                min={1}
                max={10000}
                value={output.width}
                onChange={handleWidthChange}
                style={{ width: 100 }}
              />
            </Space>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>高度：</Text>
              <InputNumber
                min={1}
                max={10000}
                value={output.height}
                onChange={handleHeightChange}
                style={{ width: 100 }}
              />
            </Space>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>锁定比例</Text>
              <Switch
                checked={output.lockAspectRatio}
                onChange={(v) => setOutput({ lockAspectRatio: v })}
              />
            </Space>
          </>
        )}
      </div>

      {/* 格式 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>输出格式：</Text>
        <Select
          value={output.format}
          onChange={(v) => setOutput({ format: v })}
          style={{ width: 140 }}
          options={FORMAT_OPTIONS}
        />
        {isPng && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            PNG 无损，将使用最大压缩力度
          </Text>
        )}
      </div>

      {/* 质量（仅有损格式显示） */}
      {showQuality && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>
            压缩质量：
          </Text>
          <Slider
            min={1}
            max={100}
            value={output.quality}
            onChange={(v) => setOutput({ quality: v })}
            style={{ flex: 1 }}
          />
          <Text strong style={{ minWidth: 40, textAlign: "right" }}>
            {output.quality}%
          </Text>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 8,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <Button
          type="primary"
          icon={<ExportOutlined />}
          loading={loading}
          onClick={handleExport}
        >
          导出
        </Button>
      </div>
    </div>
  );
};

export default OutputSettings;
