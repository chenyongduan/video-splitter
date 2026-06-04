import React, { useEffect } from "react";
import { Button, InputNumber, Space, Typography, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { cropImage } from "../../utils/image";

const { Text } = Typography;

const ImageCropper: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);
  const cropRect = useAppStore((s) => s.imageCropRect);
  const setCropRect = useAppStore((s) => s.setImageCropRect);

  const [loading, setLoading] = React.useState(false);

  // 初始化为图片完整尺寸
  useEffect(() => {
    if (imageInfo && cropRect.w === 0 && cropRect.h === 0) {
      setCropRect({ x: 0, y: 0, w: imageInfo.width, h: imageInfo.height });
    }
  }, [imageInfo, cropRect.w, cropRect.h, setCropRect]);

  const handleCrop = async () => {
    if (!imagePath || !imageInfo) return;
    if (cropRect.w <= 0 || cropRect.h <= 0) {
      message.warning("请输入有效的裁剪区域");
      return;
    }
    if (
      cropRect.x + cropRect.w > imageInfo.width ||
      cropRect.y + cropRect.h > imageInfo.height
    ) {
      message.warning("裁剪区域超出图片范围");
      return;
    }

    try {
      const ext = imagePath.split(".").pop() || "png";
      const defaultName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") +
        `_crop.${ext}`;

      const outputPath = await save({
        defaultPath: defaultName,
        filters: [{ name: "图片文件", extensions: [ext] }],
      });

      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      await cropImage(imagePath, outputPath, {
        x: cropRect.x,
        y: cropRect.y,
        width: cropRect.w,
        height: cropRect.h,
      });

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat: imageInfo.format,
        inputSize: imageInfo.fileSize,
        outputSize: 0,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${cropRect.w}×${cropRect.h}`,
        taskType: "crop",
      });

      message.success("裁剪完成");
    } catch (err) {
      message.error(`裁剪失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 8,
      }}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>X：</Text>
            <InputNumber
              min={0}
              max={imageInfo ? imageInfo.width - 1 : 9999}
              value={cropRect.x}
              onChange={(v) => {
                const newX = v ?? 0;
                const maxW = imageInfo ? imageInfo.width - newX : cropRect.w;
                setCropRect({
                  ...cropRect,
                  x: newX,
                  w: Math.min(cropRect.w, maxW),
                });
              }}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>Y：</Text>
            <InputNumber
              min={0}
              max={imageInfo ? imageInfo.height - 1 : 9999}
              value={cropRect.y}
              onChange={(v) => {
                const newY = v ?? 0;
                const maxH = imageInfo ? imageInfo.height - newY : cropRect.h;
                setCropRect({
                  ...cropRect,
                  y: newY,
                  h: Math.min(cropRect.h, maxH),
                });
              }}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>宽度：</Text>
            <InputNumber
              min={1}
              max={imageInfo ? imageInfo.width - cropRect.x : 9999}
              value={cropRect.w}
              onChange={(v) =>
                setCropRect({ ...cropRect, w: v ?? 0 })
              }
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>高度：</Text>
            <InputNumber
              min={1}
              max={imageInfo ? imageInfo.height - cropRect.y : 9999}
              value={cropRect.h}
              onChange={(v) =>
                setCropRect({ ...cropRect, h: v ?? 0 })
              }
              style={{ width: 80 }}
            />
          </Space>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button onClick={() => {
            if (imageInfo) {
              setCropRect({ x: 0, y: 0, w: imageInfo.width, h: imageInfo.height });
            }
          }}>
            重置
          </Button>
          <Button type="primary" loading={loading} onClick={handleCrop}>
            裁剪
          </Button>
        </div>
      </Space>
    </div>
  );
};

export default ImageCropper;
