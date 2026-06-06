import React, { useCallback, useEffect, useState } from "react";
import { Button, Input, Space, Card, Popconfirm, message } from "antd";
import {
  PlusOutlined,
  ScissorOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { splitVideo, getDefaultOutputDir } from "../../utils/ffmpeg";
import SegmentTable from "./SegmentTable";
import ProgressDialog from "./ProgressDialog";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";
import type { VideoProcessResult } from "../../types";

const VideoSplitter: React.FC = () => {
  const videoPath = useAppStore((s) => s.videoPath);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const segments = useAppStore((s) => s.segments);
  const isSplitting = useAppStore((s) => s.isSplitting);
  const progress = useAppStore((s) => s.progress);
  const addSegment = useAppStore((s) => s.addSegment);
  const removeSegment = useAppStore((s) => s.removeSegment);
  const setSplitting = useAppStore((s) => s.setSplitting);
  const setProgress = useAppStore((s) => s.setProgress);
  const setVideoProcessing = useAppStore((s) => s.setVideoProcessing);
  const setVideoProcessResult = useAppStore((s) => s.setVideoProcessResult);

  const [outputDir, setOutputDir] = useState("");

  // 视频路径变化时更新默认输出目录
  useEffect(() => {
    if (videoPath) {
      setOutputDir(getDefaultOutputDir(videoPath));
    }
  }, [videoPath]);

  const handleBrowseDir = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setOutputDir(selected as string);
      }
    } catch (err) {
      message.error(`选择目录失败: ${err}`);
    }
  }, []);

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

    if (!outputDir.trim()) {
      message.warning("请设置输出目录");
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
    setVideoProcessing(true);
    setProgress(null);
    setVideoProcessResult(null);

    try {
      const resultDir = await splitVideo(videoPath, outputDir, segments, (p) => {
        setProgress(p);
      });

      const result: VideoProcessResult = {
        inputPath: videoPath,
        outputPath: resultDir,
        inputFormat: videoInfo?.format || "",
        outputFormat: videoInfo?.format || "",
        inputSize: videoInfo?.fileSize || 0,
        outputSize: 0,
        inputResolution: videoInfo
          ? `${videoInfo.width}x${videoInfo.height}`
          : "",
        outputResolution: videoInfo
          ? `${videoInfo.width}x${videoInfo.height}`
          : "",
        duration: videoInfo?.duration || 0,
        taskType: "split",
      };

      setVideoProcessResult(result);
    } catch (err) {
      message.error(`切割失败: ${err}`);
    } finally {
      setSplitting(false);
      setVideoProcessing(false);
    }
  }, [
    segments,
    videoPath,
    videoInfo,
    outputDir,
    setSplitting,
    setVideoProcessing,
    setProgress,
    setVideoProcessResult,
  ]);

  return (
    <>
      {/* Output directory */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "#666", whiteSpace: "nowrap" }}>
          输出目录：
        </span>
        <Input
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          placeholder="请选择输出目录"
          style={{ flex: 1 }}
        />
        <Button icon={<FolderOpenOutlined />} onClick={handleBrowseDir}>
          浏览
        </Button>
      </div>

      <Card
        size="small"
        title="分割区间"
        bordered={false}
        style={{ boxShadow: "none", border: "none" }}
        styles={{ header: { padding: "0 0 8px 0" }, body: { padding: "8px 0 0 0" } }}
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
          paddingTop: 12,
          borderTop: "1px solid #f0f0f0",
          marginTop: 12,
        }}
      >
        <Button
          type="primary"
          icon={<ScissorOutlined />}
          onClick={handleSplit}
          loading={isSplitting}
          disabled={segments.length === 0}
        >
          开始切割 ({segments.length} 段)
        </Button>
      </div>

      <ProgressDialog
        open={isSplitting}
        current={progress?.current || 0}
        total={progress?.total || 0}
        percent={progress?.percent || 0}
      />
    </>
  );
};

export default VideoSplitter;
