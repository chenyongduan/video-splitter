import React, { useEffect } from "react";
import { Button, ColorPicker, InputNumber, Space, Switch, Typography } from "antd";
import type { Color } from "antd/es/color-picker";
import {
  RotateLeftOutlined,
  RotateRightOutlined,
  SwapOutlined,
  ScissorOutlined,
  UndoOutlined,
  BorderOuterOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../../store/segmentStore";
import { getEditedDimensions } from "../../utils/image";

const { Text } = Typography;

/**
 * 编辑工具栏：旋转 / 翻转 / 裁剪开关（含数值输入）/ 重置。
 * 所有操作实时反映在预览区，导出时一次性应用。
 */
const ImageToolbar: React.FC = () => {
  const imageInfo = useAppStore((s) => s.imageInfo);
  const rotation = useAppStore((s) => s.imageRotation);
  const flipH = useAppStore((s) => s.imageFlipH);
  const flipV = useAppStore((s) => s.imageFlipV);
  const cropRect = useAppStore((s) => s.imageCropRect);
  const cropEnabled = useAppStore((s) => s.imageCropEnabled);
  const padding = useAppStore((s) => s.imagePadding);
  const paddingColor = useAppStore((s) => s.imagePaddingColor);
  const outputFormat = useAppStore((s) => s.imageOutput.format);
  const setRotation = useAppStore((s) => s.setImageRotation);
  const setFlipH = useAppStore((s) => s.setImageFlipH);
  const setFlipV = useAppStore((s) => s.setImageFlipV);
  const setCropRect = useAppStore((s) => s.setImageCropRect);
  const setCropEnabled = useAppStore((s) => s.setImageCropEnabled);
  const setPadding = useAppStore((s) => s.setImagePadding);
  const setPaddingColor = useAppStore((s) => s.setImagePaddingColor);
  const resetImageEdit = useAppStore((s) => s.resetImageEdit);

  const isTransparent = paddingColor === "transparent";
  // 无 alpha 通道的输出格式，透明内边距导出时回退为白色
  const resolvedFormat =
    outputFormat === "original" ? imageInfo?.format : outputFormat;
  const noAlphaFallback =
    padding > 0 &&
    isTransparent &&
    (resolvedFormat === "jpg" || resolvedFormat === "bmp");

  // 旋转后的基准尺寸（不含裁剪）
  const base = imageInfo ? getEditedDimensions(imageInfo, rotation, null) : null;

  // 旋转变化导致基准尺寸改变时，已启用的裁剪框可能越界 → 重置为完整尺寸
  useEffect(() => {
    if (cropEnabled && base) {
      setCropRect({ x: 0, y: 0, w: base.width, h: base.height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, cropEnabled]);

  const handleToggleCrop = () => {
    if (!imageInfo || !base) return;
    if (!cropEnabled) {
      // 开启裁剪：初始化为旋转后的完整尺寸（若尚未有裁剪框）
      if (cropRect.w === 0 || cropRect.h === 0) {
        setCropRect({ x: 0, y: 0, w: base.width, h: base.height });
      }
      setCropEnabled(true);
    } else {
      setCropEnabled(false);
    }
  };

  const iconBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    background: active ? "#1677ff" : "#f5f5f5",
    border: `1px solid ${active ? "#1677ff" : "#e8e8e8"}`,
    fontSize: 16,
    color: active ? "#fff" : "#555",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          title="向左旋转 90°"
          onClick={() => setRotation(rotation - 90)}
          style={iconBtnStyle(false)}
        >
          <RotateLeftOutlined />
        </div>
        <div
          title="向右旋转 90°"
          onClick={() => setRotation(rotation + 90)}
          style={iconBtnStyle(false)}
        >
          <RotateRightOutlined />
        </div>
        <div
          title="水平翻转"
          onClick={() => setFlipH(!flipH)}
          style={iconBtnStyle(flipH)}
        >
          <SwapOutlined />
        </div>
        <div
          title="垂直翻转"
          onClick={() => setFlipV(!flipV)}
          style={iconBtnStyle(flipV)}
        >
          <SwapOutlined style={{ transform: "rotate(90deg)" }} />
        </div>

        <div style={{ width: 1, height: 24, background: "#e8e8e8" }} />

        <Button
          icon={<ScissorOutlined />}
          type={cropEnabled ? "primary" : "default"}
          onClick={handleToggleCrop}
        >
          裁剪
        </Button>

        <div style={{ width: 1, height: 24, background: "#e8e8e8" }} />

        {/* 内边距 */}
        <Space>
          <BorderOuterOutlined style={{ color: "#666" }} />
          <Text style={{ fontSize: 13, color: "#666" }}>内边距：</Text>
          <InputNumber
            min={0}
            max={500}
            value={padding}
            onChange={(v) => setPadding(v ?? 0)}
            style={{ width: 80 }}
          />
        </Space>
        {padding > 0 && (
          <>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>透明</Text>
              <Switch
                checked={isTransparent}
                onChange={(v) => setPaddingColor(v ? "transparent" : "#ffffff")}
              />
            </Space>
            {!isTransparent && (
              <ColorPicker
                value={paddingColor}
                onChange={(color: Color) => setPaddingColor(color.toHexString())}
                disabledAlpha
              />
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        <Button icon={<UndoOutlined />} onClick={resetImageEdit}>
          重置编辑
        </Button>
      </div>

      {/* 透明回退提示 */}
      {noAlphaFallback && (
        <Text type="warning" style={{ fontSize: 12 }}>
          {resolvedFormat?.toUpperCase()} 不支持透明，导出时内边距将使用白色
        </Text>
      )}

      {/* 裁剪数值输入 */}
      {cropEnabled && base && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            paddingTop: 8,
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>X：</Text>
            <InputNumber
              min={0}
              max={base.width - 1}
              value={cropRect.x}
              onChange={(v) => {
                const newX = v ?? 0;
                setCropRect({
                  ...cropRect,
                  x: newX,
                  w: Math.min(cropRect.w, base.width - newX),
                });
              }}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>Y：</Text>
            <InputNumber
              min={0}
              max={base.height - 1}
              value={cropRect.y}
              onChange={(v) => {
                const newY = v ?? 0;
                setCropRect({
                  ...cropRect,
                  y: newY,
                  h: Math.min(cropRect.h, base.height - newY),
                });
              }}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>宽度：</Text>
            <InputNumber
              min={1}
              max={base.width - cropRect.x}
              value={cropRect.w}
              onChange={(v) => setCropRect({ ...cropRect, w: v ?? 0 })}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>高度：</Text>
            <InputNumber
              min={1}
              max={base.height - cropRect.y}
              value={cropRect.h}
              onChange={(v) => setCropRect({ ...cropRect, h: v ?? 0 })}
              style={{ width: 80 }}
            />
          </Space>
          <Button
            size="small"
            onClick={() => setCropRect({ x: 0, y: 0, w: base.width, h: base.height })}
          >
            全图
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageToolbar;
