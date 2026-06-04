import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";

const ImagePreview: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageFunctionTab = useAppStore((s) => s.imageFunctionTab);
  const imageRotation = useAppStore((s) => s.imageRotation);
  const imageFlipH = useAppStore((s) => s.imageFlipH);
  const imageFlipV = useAppStore((s) => s.imageFlipV);

  if (!imagePath) return null;

  const src = convertFileSrc(imagePath);

  // 只在旋转 tab 下应用 transform 预览
  const showTransform = imageFunctionTab === "rotate";
  const transforms: string[] = [];
  if (showTransform && imageRotation !== 0) {
    transforms.push(`rotate(${imageRotation}deg)`);
  }
  if (showTransform && imageFlipH) {
    transforms.unshift("scaleX(-1)");
  }
  if (showTransform && imageFlipV) {
    transforms.unshift("scaleY(-1)");
  }
  const transform = transforms.length > 0 ? transforms.join(" ") : undefined;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "12px 0",
        marginBottom: 12,
        background: "#fafafa",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <img
        src={src}
        alt="预览"
        style={{
          maxWidth: "100%",
          maxHeight: 320,
          objectFit: "contain",
          borderRadius: 4,
          transform,
          transition: "transform 0.2s ease",
        }}
      />
    </div>
  );
};

export default ImagePreview;
