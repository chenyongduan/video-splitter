import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Alert,
  Spin,
  message,
} from "antd";
import {
  FolderOpenOutlined,
  InboxOutlined,
  DeleteOutlined,
  FolderOutlined,
} from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getVideoInfo } from "../../utils/ffmpeg";
import { formatTime } from "../../utils/format";
import VideoPlayer from "./VideoPlayer";
import VideoConverter from "./VideoConverter";
import VideoCompressor from "./VideoCompressor";
import VideoSplitter from "./VideoSplitter";
import { useAppStore } from "../../store/segmentStore";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const VideoPage: React.FC = () => {
  const {
    videoInfo,
    videoFileName,
    isVideoLoaded,
    setVideo,
    clearVideo,
    videoFunctionTab,
    setVideoFunctionTab,
    isVideoProcessing,
    videoProcessResult,
  } = useAppStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const loadVideoFile = useCallback(
    async (filePath: string) => {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        message.error(
          `不支持的格式: .${ext}，仅支持 ${SUPPORTED_EXTENSIONS.join(", ")}`,
        );
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "video.mp4";

      try {
        const info = await getVideoInfo(filePath);
        setVideo(filePath, fileName, info);
      } catch (err) {
        message.error(`加载失败: ${err}`);
      }
    },
    [setVideo],
  );

  const handleLoadVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "视频文件",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;
      await loadVideoFile(selected as string);
    } catch (err) {
      message.error(`选择文件失败: ${err}`);
    }
  }, [loadVideoFile]);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          loadVideoFile(files[0]);
        }
      } else if (event.payload.type === "over") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadVideoFile]);

  // ===== Drop zone (no file loaded) =====
  if (!isVideoLoaded) {
    return (
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <Card style={{ marginTop: 48 }}>
          <div
            ref={dropRef}
            onClick={handleLoadVideo}
            style={{
              padding: "60px 0",
              textAlign: "center",
              cursor: "pointer",
              borderRadius: 8,
              border: `2px dashed ${isDragOver ? "#1890ff" : "#d9d9d9"}`,
              background: isDragOver ? "#e6f7ff" : "transparent",
              transition: "all 0.3s",
            }}
          >
            <InboxOutlined
              style={{
                fontSize: 48,
                color: isDragOver ? "#1890ff" : "#999",
              }}
            />
            <p style={{ fontSize: 16, marginTop: 16 }}>
              拖拽视频文件到此处，或点击选择
            </p>
            <p style={{ color: "#999" }}>
              支持 MP4, MOV, MKV, AVI, WebM 格式
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ===== Main layout (file loaded) =====

  const handleOpenDir = async () => {
    if (videoProcessResult?.outputPath) {
      await revealItemInDir(videoProcessResult.outputPath);
    }
  };

  const tabLabels = {
    convert: "格式转换",
    compress: "视频压缩",
    split: "视频分割",
  } as const;

  return (
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
          <Text strong ellipsis style={{ maxWidth: 400 }}>
            {videoFileName}
          </Text>
          {videoInfo && (
            <Tag color="blue">
              {videoInfo.format.toUpperCase()}
            </Tag>
          )}
          {videoInfo && (
            <>
              <Tag color="blue">
                {videoInfo.width}×{videoInfo.height}
              </Tag>
              <Tag color="green">
                {formatTime(videoInfo.duration)}
              </Tag>
            </>
          )}
        </div>
        <Space>
          <Button icon={<FolderOpenOutlined />} onClick={handleLoadVideo}>
            选择视频
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={clearVideo}>
            清除
          </Button>
        </Space>
      </div>

      {/* Video Player */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <VideoPlayer />
      </Card>

      {/* Function Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["convert", "compress", "split"] as const).map((tab) => {
          const active = videoFunctionTab === tab;
          return (
            <div
              key={tab}
              onClick={() => setVideoFunctionTab(tab)}
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
      <Spin spinning={isVideoProcessing} tip="处理中...">
        {videoFunctionTab === "convert" && <VideoConverter />}
        {videoFunctionTab === "compress" && <VideoCompressor />}
        {videoFunctionTab === "split" && <VideoSplitter />}
      </Spin>

      {/* Result (for convert/compress) */}
      {videoProcessResult && (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message="处理完成"
          description={
            <div style={{ fontSize: 13 }}>
              <div>
                文件名：
                {videoProcessResult.inputPath.split(/[/\\]/).pop()} →{" "}
                {videoProcessResult.outputPath.split(/[/\\]/).pop()}
              </div>
              <div>
                格式：{videoProcessResult.inputFormat.toUpperCase()} →{" "}
                {videoProcessResult.outputFormat.toUpperCase()}
              </div>
              <div>
                文件大小：{formatFileSize(videoProcessResult.inputSize)} →{" "}
                {formatFileSize(videoProcessResult.outputSize)}
              </div>
              <div>
                分辨率：{videoProcessResult.inputResolution} →{" "}
                {videoProcessResult.outputResolution}
              </div>
              <div>时长：{formatTime(videoProcessResult.duration)}</div>
              <Button
                size="small"
                icon={<FolderOutlined />}
                style={{ marginTop: 8 }}
                onClick={handleOpenDir}
              >
                打开文件所在目录
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
};

export default VideoPage;
