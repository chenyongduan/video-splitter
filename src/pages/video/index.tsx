import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Space,
  Typography,
  Card,
  Tag,
  Spin,
  message,
} from "antd";
import {
  FolderOpenOutlined,
  InboxOutlined,
  DeleteOutlined,
  SwapOutlined,
  CompressOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getVideoInfo } from "../../utils/ffmpeg";
import { formatTime, formatFileSize } from "../../utils/format";
import ProcessNotification from "../../components/ProcessNotification";
import VideoPlayer from "./VideoPlayer";
import VideoConverter from "./VideoConverter";
import VideoCompressor from "./VideoCompressor";
import VideoSplitter from "./VideoSplitter";
import { useAppStore } from "../../store/segmentStore";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

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
    setVideoProcessResult,
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

  const tabItems = [
    { key: "convert" as const, label: "格式转换", icon: <SwapOutlined /> },
    { key: "compress" as const, label: "视频压缩", icon: <CompressOutlined /> },
    { key: "split" as const, label: "视频分割", icon: <ScissorOutlined /> },
  ];

  return (
    <>
      <ProcessNotification
        result={videoProcessResult}
        extraLines={
          videoProcessResult ? (
            <>
              <div>
                分辨率：{videoProcessResult.inputResolution} →{" "}
                {videoProcessResult.outputResolution}
              </div>
              <div>时长：{formatTime(videoProcessResult.duration)}</div>
            </>
          ) : undefined
        }
        onDone={() => setVideoProcessResult(null)}
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
                <Tag color="orange">
                  {formatFileSize(videoInfo.fileSize)}
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
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {tabItems.map((tab) => {
            const active = videoFunctionTab === tab.key;
            return (
              <div
                key={tab.key}
                onClick={() => setVideoFunctionTab(tab.key)}
                style={{
                  padding: "6px 18px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: active ? "#1677ff" : "#fff",
                  color: active ? "#fff" : "#555",
                  border: `1px solid ${active ? "#1677ff" : "#d9d9d9"}`,
                  transition: "all 0.2s",
                  userSelect: "none",
                }}
              >
                {tab.icon}
                {tab.label}
              </div>
            );
          })}
        </div>

        {/* Function Panel */}
        <Spin spinning={isVideoProcessing} tip="处理中...">
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #e8e8e8",
              padding: 16,
            }}
          >
            {videoFunctionTab === "convert" && <VideoConverter />}
            {videoFunctionTab === "compress" && <VideoCompressor />}
            {videoFunctionTab === "split" && <VideoSplitter />}
          </div>
        </Spin>
      </div>
    </>
  );
};

export default VideoPage;
