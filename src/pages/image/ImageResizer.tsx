import React, { useEffect, useState } from "react";
import { Button, InputNumber, Space, Switch, Typography, message } from "antd";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { resizeImage } from "../../utils/image";

const { Text } = Typography;

const ImageResizer: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);

  const [keepRatio, setKeepRatio] = useState(true);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(false);

  // 初始化为原始尺寸
  useEffect(() => {
    if (imageInfo) {
      setWidth(imageInfo.width);
      setHeight(imageInfo.height);
      setScale(1);
    }
  }, [imageInfo]);

  // 倍数变化时更新宽高
  const handleScaleChange = (val: number | null) => {
    if (val === null || !imageInfo) return;
    setScale(val);
    setWidth(Math.round(imageInfo.width * val));
    setHeight(Math.round(imageInfo.height * val));
  };

  const handleWidthChange = (val: number | null) => {
    if (val === null) return;
    setWidth(val);
    if (keepRatio && imageInfo && imageInfo.width > 0) {
      setHeight(Math.round((val / imageInfo.width) * imageInfo.height));
    }
    setScale(val / (imageInfo?.width || 1));
  };

  const handleHeightChange = (val: number | null) => {
    if (val === null) return;
    setHeight(val);
    if (keepRatio && imageInfo && imageInfo.height > 0) {
      setWidth(Math.round((val / imageInfo.height) * imageInfo.width));
    }
    setScale(val / (imageInfo?.height || 1));
  };

  const handleResize = async () => {
    if (!imagePath || !imageInfo) return;
    if (width <= 0 || height <= 0) {
      message.warning("请输入有效的宽度和高度");
      return;
    }

    try {
      const ext = imagePath.split(".").pop() || "png";
      const defaultName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") +
        `_${width}x${height}.` +
        ext;

      const outputPath = await save({
        defaultPath: defaultName,
        filters: [{ name: "图片文件", extensions: [ext] }],
      });

      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      await resizeImage(imagePath, outputPath, {
        width,
        height,
        keepAspectRatio: keepRatio,
      });

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat: imageInfo.format,
        inputSize: imageInfo.fileSize,
        outputSize: 0,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${width}×${height}`,
        taskType: "resize",
      });

      message.success("尺寸调整完成");
    } catch (err) {
      message.error(`尺寸调整失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Space>
          <Text style={{ fontSize: 13, color: "#666" }}>宽度：</Text>
          <InputNumber
            min={1}
            max={10000}
            value={width}
            onChange={handleWidthChange}
            style={{ width: 100 }}
          />
        </Space>
        <Space>
          <Text style={{ fontSize: 13, color: "#666" }}>高度：</Text>
          <InputNumber
            min={1}
            max={10000}
            value={height}
            onChange={handleHeightChange}
            style={{ width: 100 }}
          />
        </Space>
        <Space>
          <Text style={{ fontSize: 13, color: "#666" }}>倍数：</Text>
          <InputNumber
            min={0.1}
            max={10}
            step={0.1}
            value={parseFloat(scale.toFixed(2))}
            onChange={handleScaleChange}
            style={{ width: 80 }}
          />
        </Space>
        <Space>
          <Text style={{ fontSize: 13, color: "#666" }}>锁定比例</Text>
          <Switch checked={keepRatio} onChange={setKeepRatio} />
        </Space>
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
        <Button onClick={() => {
          if (imageInfo) {
            setWidth(imageInfo.width);
            setHeight(imageInfo.height);
            setScale(1);
            setKeepRatio(true);
          }
        }}>
          重置
        </Button>
        <Button type="primary" loading={loading} onClick={handleResize}>
          导出
        </Button>
      </div>
    </div>
  );
};

export default ImageResizer;
