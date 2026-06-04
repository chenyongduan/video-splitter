import React, { useCallback } from "react";
import { Button, Space, Typography, Spin, message } from "antd";
import { DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { formatFileSize } from "../../utils/format";
import { getImageInfo } from "../../utils/image";
import ProcessNotification from "../../components/ProcessNotification";
import ImageDropZone from "./ImageDropZone";
import ImageMetadata from "./ImageMetadata";
import ImagePreview from "./ImagePreview";
import ImageConverter from "./ImageConverter";
import ImageCompressor from "./ImageCompressor";
import ImageResizer from "./ImageResizer";
import ImageCropper from "./ImageCropper";
import ImageRotator from "./ImageRotator";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "ico",
  "tiff",
  "gif",
];

const ImagePage: React.FC = () => {
  const isImageLoaded = useAppStore((s) => s.isImageLoaded);
  const imageFileName = useAppStore((s) => s.imageFileName);
  const imageFunctionTab = useAppStore((s) => s.imageFunctionTab);
  const setImageFunctionTab = useAppStore((s) => s.setImageFunctionTab);
  const imageProcessResult = useAppStore((s) => s.imageProcessResult);
  const isImageProcessing = useAppStore((s) => s.isImageProcessing);
  const clearImage = useAppStore((s) => s.clearImage);
  const setImageFile = useAppStore((s) => s.setImageFile);
  const setImageProcessResult = useAppStore((s) => s.setImageProcessResult);

  const handleLoadImage = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片文件",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileName = filePath.split(/[/\\]/).pop() || "image.png";
      const info = await getImageInfo(filePath);
      setImageFile(filePath, fileName, info);
    } catch (err) {
      message.error(`加载失败: ${err}`);
    }
  }, [setImageFile]);

  if (!isImageLoaded) {
    return (
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <ImageDropZone />
      </div>
    );
  }

  const tabLabels = {
    convert: "格式转换",
    compress: "图片压缩",
    resize: "尺寸调整",
    crop: "图片裁剪",
    rotate: "旋转翻转",
  } as const;

  return (
    <>
      <ProcessNotification
        result={imageProcessResult}
        extraLines={
          imageProcessResult ? (
            <>
              <div>
                尺寸：{imageProcessResult.inputDimensions} →{" "}
                {imageProcessResult.outputDimensions}
              </div>
              <div>
                文件大小：{formatFileSize(imageProcessResult.inputSize)} →{" "}
                {formatFileSize(imageProcessResult.outputSize)}
              </div>
            </>
          ) : undefined
        }
        onDone={() => setImageProcessResult(null)}
      />
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong ellipsis style={{ maxWidth: 600 }}>
              {imageFileName}
            </Text>
          </div>
          <Space>
            <Button icon={<FolderOpenOutlined />} onClick={handleLoadImage}>
              选择图片
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={clearImage}>
              清空
            </Button>
          </Space>
        </div>

        {/* Metadata */}
        <ImageMetadata />

        {/* Image Preview */}
        <ImagePreview />

        {/* Function Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(
            ["convert", "compress", "resize", "crop", "rotate"] as const
          ).map((tab) => {
            const active = imageFunctionTab === tab;
            return (
              <div
                key={tab}
                onClick={() => setImageFunctionTab(tab)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer",
                  background: active ? "#1677ff" : "#fff",
                  color: active ? "#fff" : "#333",
                  border: `1px solid ${active ? "#1677ff" : "#d9d9d9"}`,
                  transition: "all 0.2s",
                }}
              >
                {tabLabels[tab]}
              </div>
            );
          })}
        </div>

        {/* Function Panel */}
        <Spin spinning={isImageProcessing} tip="处理中...">
          {imageFunctionTab === "convert" && <ImageConverter />}
          {imageFunctionTab === "compress" && <ImageCompressor />}
          {imageFunctionTab === "resize" && <ImageResizer />}
          {imageFunctionTab === "crop" && <ImageCropper />}
          {imageFunctionTab === "rotate" && <ImageRotator />}
        </Spin>
      </div>
    </>
  );
};

export default ImagePage;
