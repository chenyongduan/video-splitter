import React, { useRef, useState, useCallback, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import { getEditedDimensions } from "../../utils/image";

type DragType = "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

interface ImgDisplay {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 裁剪遮罩层：在图片上方叠加一个半透明黑色遮罩，
 * 裁剪区域内透明，带边框和拖拽手柄。
 * 支持拖拽移动和边角缩放。
 */
const CropOverlay: React.FC<{
  imgDisplay: ImgDisplay;
}> = ({ imgDisplay }) => {
  const imageInfo = useAppStore((s) => s.imageInfo);
  const rotation = useAppStore((s) => s.imageRotation);
  const cropRect = useAppStore((s) => s.imageCropRect);
  const setCropRect = useAppStore((s) => s.setImageCropRect);

  // 旋转后的基准尺寸（不含裁剪）：90/270 时宽高互换
  const base = imageInfo ? getEditedDimensions(imageInfo, rotation, null) : null;

  // 拖拽状态
  const dragRef = useRef<{
    type: DragType;
    startMouseX: number;
    startMouseY: number;
    startRect: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const imgToPx = useCallback(
    (ix: number, iy: number) => {
      const d = imgDisplay;
      return {
        px: d.offsetX + (ix / (base?.width ?? 1)) * d.width,
        py: d.offsetY + (iy / (base?.height ?? 1)) * d.height,
      };
    },
    [imgDisplay, base]
  );

  // 鼠标按下
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: DragType) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        type,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startRect: { ...cropRect },
      };

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag || !base) return;

        const dx = ev.clientX - drag.startMouseX;
        const dy = ev.clientY - drag.startMouseY;

        // 像素偏移 → 图片像素偏移
        const d = imgDisplay;
        const scaleX = base.width / d.width;
        const scaleY = base.height / d.height;
        const imgDx = dx * scaleX;
        const imgDy = dy * scaleY;

        const { startRect, type: dragType } = drag;
        let newX = startRect.x;
        let newY = startRect.y;
        let newW = startRect.w;
        let newH = startRect.h;
        const minSize = 10;

        if (dragType === "move") {
          newX = Math.max(0, Math.min(startRect.x + imgDx, base.width - startRect.w));
          newY = Math.max(0, Math.min(startRect.y + imgDy, base.height - startRect.h));
        } else {
          if (dragType.includes("w")) {
            newX = Math.max(0, startRect.x + imgDx);
            newW = Math.max(minSize, startRect.w - imgDx);
            if (newX + newW > base.width) newW = base.width - newX;
          }
          if (dragType.includes("e")) {
            newW = Math.max(minSize, Math.min(startRect.w + imgDx, base.width - startRect.x));
          }
          if (dragType.includes("n")) {
            newY = Math.max(0, startRect.y + imgDy);
            newH = Math.max(minSize, startRect.h - imgDy);
            if (newY + newH > base.height) newH = base.height - newY;
          }
          if (dragType.includes("s")) {
            newH = Math.max(minSize, Math.min(startRect.h + imgDy, base.height - startRect.y));
          }
        }

        setCropRect({ x: Math.round(newX), y: Math.round(newY), w: Math.round(newW), h: Math.round(newH) });
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [cropRect, base, setCropRect, imgDisplay]
  );

  if (!base || cropRect.w === 0) return null;

  const d = imgDisplay;

  // 裁剪矩形在容器内的像素位置
  const topLeft = imgToPx(cropRect.x, cropRect.y);
  const bottomRight = imgToPx(cropRect.x + cropRect.w, cropRect.y + cropRect.h);
  const cropPxW = bottomRight.px - topLeft.px;
  const cropPxH = bottomRight.py - topLeft.py;

  const handleSize = 10;
  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: "absolute",
    width: handleSize,
    height: handleSize,
    background: "transparent",
    cursor,
    zIndex: 10,
  });

  // 八个方向的边/角手柄
  const handles = [
    { type: "nw" as const, left: -handleSize / 2, top: -handleSize / 2, cursor: "nw-resize" },
    { type: "ne" as const, right: -handleSize / 2, top: -handleSize / 2, cursor: "ne-resize" },
    { type: "sw" as const, left: -handleSize / 2, bottom: -handleSize / 2, cursor: "sw-resize" },
    { type: "se" as const, right: -handleSize / 2, bottom: -handleSize / 2, cursor: "se-resize" },
    { type: "n" as const, top: -4, cursor: "n-resize", widthPercent: true },
    { type: "s" as const, bottom: -4, cursor: "s-resize", widthPercent: true },
    { type: "w" as const, left: -4, cursor: "w-resize", heightPercent: true },
    { type: "e" as const, right: -4, cursor: "e-resize", heightPercent: true },
  ];

  return (
    <>
      {/* 半透明遮罩 — 四块覆盖裁剪区域外 */}
      {/* 上方 */}
      <div
        style={{
          position: "absolute",
          left: d.offsetX,
          top: d.offsetY,
          width: d.width,
          height: topLeft.py - d.offsetY,
          background: "rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
      {/* 下方 */}
      <div
        style={{
          position: "absolute",
          left: d.offsetX,
          top: bottomRight.py,
          width: d.width,
          height: d.offsetY + d.height - bottomRight.py,
          background: "rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
      {/* 左方 */}
      <div
        style={{
          position: "absolute",
          left: d.offsetX,
          top: topLeft.py,
          width: topLeft.px - d.offsetX,
          height: cropPxH,
          background: "rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />
      {/* 右方 */}
      <div
        style={{
          position: "absolute",
          left: bottomRight.px,
          top: topLeft.py,
          width: d.offsetX + d.width - bottomRight.px,
          height: cropPxH,
          background: "rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />

      {/* 裁剪框 */}
      <div
        style={{
          position: "absolute",
          left: topLeft.px,
          top: topLeft.py,
          width: cropPxW,
          height: cropPxH,
          border: "1px solid #1677ff",
          cursor: "move",
          boxSizing: "border-box",
        }}
        onMouseDown={(e) => handleMouseDown(e, "move")}
      >
        {/* 三分线（辅助线） */}
        <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.3)" }} />
        <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.3)" }} />
        <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.3)" }} />
        <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.3)" }} />

        {/* 拖拽手柄 */}
        {handles.map((h) => (
          <div
            key={h.type}
            style={{
              ...handleStyle(h.cursor),
              ...(("left" in h) ? { left: h.left } : {}),
              ...(("right" in h) ? { right: h.right } : {}),
              ...(("top" in h) ? { top: h.top } : {}),
              ...(("bottom" in h) ? { bottom: h.bottom } : {}),
              ...(("widthPercent" in h) ? { width: "100%", height: 8 } : {}),
              ...(("heightPercent" in h) ? { height: "100%", width: 8 } : {}),
            }}
            onMouseDown={(e) => handleMouseDown(e, h.type)}
          />
        ))}
      </div>
    </>
  );
};

const ImagePreview: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageCropEnabled = useAppStore((s) => s.imageCropEnabled);
  const imageRotation = useAppStore((s) => s.imageRotation);
  const imageFlipH = useAppStore((s) => s.imageFlipH);
  const imageFlipV = useAppStore((s) => s.imageFlipV);
  const imagePadding = useAppStore((s) => s.imagePadding);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgDisplay, setImgDisplay] = useState<ImgDisplay>({ width: 0, height: 0, offsetX: 0, offsetY: 0 });
  const [baseHeight, setBaseHeight] = useState(0);

  // 直接测量 img 元素相对于容器的位置和尺寸
  const measureImg = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const cRect = container.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();

    setImgDisplay({
      width: iRect.width,
      height: iRect.height,
      offsetX: iRect.left - cRect.left,
      offsetY: iRect.top - cRect.top,
    });
  }, []);

  // 图片加载完成 + 容器尺寸变化时重新测量
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      measureImg();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureImg]);

  if (!imagePath) return null;

  const src = convertFileSrc(imagePath);

  // 编辑状态实时预览：旋转 + 翻转
  const transforms: string[] = [];
  if (imageRotation !== 0) {
    transforms.push(`rotate(${imageRotation}deg)`);
  }
  if (imageFlipH) {
    transforms.unshift("scaleX(-1)");
  }
  if (imageFlipV) {
    transforms.unshift("scaleY(-1)");
  }
  const transform = transforms.length > 0 ? transforms.join(" ") : undefined;

  const showCrop = imageCropEnabled;

  // 旋转 90/270 度时交换 maxWidth / maxHeight 约束
  const absRotation = (((imageRotation % 360) + 360) % 360) as number;
  const isRotated = absRotation === 90 || absRotation === 270;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "12px 0",
        marginBottom: 12,
        background: "#fafafa",
        borderRadius: 8,
        overflow: "hidden",
        userSelect: "none",
        minHeight: baseHeight || undefined,
      }}
    >
      {/* 内边距包裹层：承担 padding，不改变 img 自身的测量。
          预览用白底让边距可见，导出时仍为透明 */}
      <div
        style={{
          padding: imagePadding,
          background: imagePadding > 0 ? "#fff" : undefined,
          borderRadius: 4,
          lineHeight: 0,
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt="预览"
          onLoad={() => {
            measureImg();
            // 记录初始容器高度（未旋转时）
            if (containerRef.current && !baseHeight) {
              setBaseHeight(containerRef.current.clientHeight);
            }
          }}
          style={{
            maxWidth: isRotated ? 320 : "100%",
            maxHeight: 320,
            objectFit: "contain",
            borderRadius: 4,
            transform,
            transition: "transform 0.2s ease",
            pointerEvents: showCrop ? "none" : undefined,
            display: "block",
          }}
        />
      </div>
      {/* 裁剪遮罩层 */}
      {showCrop && imgDisplay.width > 0 && (
        <CropOverlay imgDisplay={imgDisplay} />
      )}
    </div>
  );
};

export default ImagePreview;
