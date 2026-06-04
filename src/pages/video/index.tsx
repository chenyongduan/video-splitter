import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Space,
  Typography,
  Card,
  message,
  Tag,
  Alert,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  ScissorOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getVideoInfo, splitVideo } from "../../utils/ffmpeg";
import VideoPlayer from "./VideoPlayer";
import SegmentTable from "./SegmentTable";
import ProgressDialog from "./ProgressDialog";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

const VideoPage: React.FC = () => {
  const {
    videoPath,
    videoInfo,
    videoFileName,
    isVideoLoaded,
    segments,
    isSplitting,
    progress,
    splitResult,
    setVideo,
    clearVideo,
    addSegment,
    removeSegment,
    setSplitting,
    setProgress,
    setSplitResult,
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
        message.success(`已加载: ${fileName}`);
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

  const handleAddSegment = useCallback(() => {
    if (!videoInfo) return;
    const duration = videoInfo.duration;

    const lastEnd =
      segments.length > 0 ? segments[segments.length - 1].end : 0;
    const start = lastEnd;
    const end = Math.min(start + 30, duration);

    if (start >= duration) {
      message.warning("已到达视频末尾");
      return;
    }

    addSegment(start, end);
  }, [videoInfo, segments, addSegment]);

  const handleSplit = useCallback(async () => {
    if (segments.length === 0) {
      message.warning("请先添加分割区间");
      return;
    }

    for (const seg of segments) {
      if (seg.start >= seg.end) {
        message.error(
          `区间 ${formatTime(seg.start)} - ${formatTime(seg.end)} 无效：开始时间必须小于结束时间`,
        );
        return;
      }
      if (videoInfo && seg.end > videoInfo.duration) {
        message.error(
          `区间 ${formatTime(seg.start)} - ${formatTime(seg.end)} 超出视频时长`,
        );
        return;
      }
    }

    setSplitting(true);
    setProgress(null);
    setSplitResult(null);

    try {
      const result = await splitVideo(videoPath, segments, (p) => {
        setProgress(p);
      });
      setSplitResult(result);
      message.success("切割完成！");
    } catch (err) {
      message.error(`切割失败: ${err}`);
    } finally {
      setSplitting(false);
    }
  }, [
    segments,
    videoPath,
    videoInfo,
    setSplitting,
    setProgress,
    setSplitResult,
  ]);

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {!isVideoLoaded ? (
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
      ) : (
        <>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Text strong ellipsis style={{ maxWidth: 400 }}>
                {videoFileName}
              </Text>
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
              <Button
                icon={<FolderOpenOutlined />}
                onClick={handleLoadVideo}
              >
                选择视频
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={clearVideo}
              >
                清除
              </Button>
            </Space>
          </div>

          {/* Video Player */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <VideoPlayer />
          </Card>

          {/* Segment Section */}
          <Card
            size="small"
            title="分割区间"
            extra={
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddSegment}
                >
                  添加区间
                </Button>
                <Popconfirm
                  title="确定清空所有分割区间？"
                  onConfirm={() =>
                    useAppStore.getState().clearSegments()
                  }
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    disabled={segments.length === 0}
                  >
                    清空
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <SegmentTable
              segments={segments}
              onRemove={removeSegment}
            />
          </Card>

          {/* Split button */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 16,
            }}
          >
            <Button
              type="primary"
              size="large"
              icon={<ScissorOutlined />}
              onClick={handleSplit}
              loading={isSplitting}
              disabled={segments.length === 0}
            >
              开始切割 ({segments.length} 段)
            </Button>
          </div>

          {/* Result */}
          {splitResult && (
            <Alert
              style={{ marginTop: 12 }}
              message="切割完成"
              description={`输出目录: ${splitResult}`}
              type="success"
              showIcon
            />
          )}
        </>
      )}

      <ProgressDialog
        open={isSplitting}
        current={progress?.current || 0}
        total={progress?.total || 0}
        percent={progress?.percent || 0}
      />
    </div>
  );
};

export default VideoPage;
