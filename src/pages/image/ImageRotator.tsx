import React, { useState } from "react";
import { Button, Space, Switch, Typography, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { rotateImage, getImageInfo } from "../../utils/image";

const { Text } = Typography;

const ImageRotator: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);

  const rotation = useAppStore((s) => s.imageRotation);
  const flipH = useAppStore((s) => s.imageFlipH);
  const flipV = useAppStore((s) => s.imageFlipV);
  const setRotation = useAppStore((s) => s.setImageRotation);
  const setFlipH = useAppStore((s) => s.setImageFlipH);
  const setFlipV = useAppStore((s) => s.setImageFlipV);

  const [loading, setLoading] = useState(false);

  const absRotation = ((rotation % 360) + 360) % 360;

  const handleRotate = async () => {
    if (!imagePath || !imageInfo) return;

    if (absRotation === 0 && !flipH && !flipV) {
      message.warning("请先选择旋转或翻转操作");
      return;
    }

    try {
      const ext = imagePath.split(".").pop() || "png";
      const defaultName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") +
        "_rotated." +
        ext;

      const outputPath = await save({
        defaultPath: defaultName,
        filters: [{ name: "图片文件", extensions: [ext] }],
      });

      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      await rotateImage(imagePath, outputPath, {
        rotation: absRotation as 0 | 90 | 180 | 270,
        flipHorizontal: flipH,
        flipVertical: flipV,
      });

      const outputInfo = await getImageInfo(outputPath);

      const rotated = absRotation === 90 || absRotation === 270;
      const outW = rotated ? imageInfo.height : imageInfo.width;
      const outH = rotated ? imageInfo.width : imageInfo.height;

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat: imageInfo.format,
        inputSize: imageInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${outW}×${outH}`,
        taskType: "rotate",
      });

      message.success("旋转/翻转完成");
    } catch (err) {
      message.error(`旋转/翻转失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* 翻转开关 */}
        <Space>
          <Text style={{ fontSize: 13, color: "#666" }}>水平翻转</Text>
          <Switch checked={flipH} onChange={setFlipH} />
        </Space>
        <Space>
          <Text style={{ fontSize: 13, color: "#666" }}>垂直翻转</Text>
          <Switch checked={flipV} onChange={setFlipV} />
        </Space>

        <div style={{ width: 1, height: 24, background: "#e8e8e8" }} />

        {/* 逆时针旋转 */}
        <div
          onClick={() => setRotation(rotation - 90)}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s",
            background: "#f5f5f5",
            border: "1px solid #e8e8e8",
            fontSize: 16,
            color: "#555",
          }}
        >
          ↺
        </div>
        {/* 顺时针旋转 */}
        <div
          onClick={() => setRotation(rotation + 90)}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s",
            background: "#f5f5f5",
            border: "1px solid #e8e8e8",
            fontSize: 16,
            color: "#555",
          }}
        >
          ↻
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          paddingTop: 8,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <Button onClick={() => { setRotation(0); setFlipH(false); setFlipV(false); }}>
          重置
        </Button>
        <Button type="primary" loading={loading} onClick={handleRotate}>
          导出
        </Button>
      </div>
    </div>
  );
};

export default ImageRotator;
