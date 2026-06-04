import React, { useCallback } from "react";
import { Button, Space, Card, Popconfirm, message } from "antd";
import { PlusOutlined, ScissorOutlined } from "@ant-design/icons";
import { splitVideo } from "../../utils/ffmpeg";
import SegmentTable from "./SegmentTable";
import ProgressDialog from "./ProgressDialog";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";

const VideoSplitter: React.FC = () => {
  const videoPath = useAppStore((s) => s.videoPath);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const segments = useAppStore((s) => s.segments);
  const isSplitting = useAppStore((s) => s.isSplitting);
  const progress = useAppStore((s) => s.progress);
  const splitResult = useAppStore((s) => s.splitResult);
  const addSegment = useAppStore((s) => s.addSegment);
  const removeSegment = useAppStore((s) => s.removeSegment);
  const setSplitting = useAppStore((s) => s.setSplitting);
  const setProgress = useAppStore((s) => s.setProgress);
  const setSplitResult = useAppStore((s) => s.setSplitResult);

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
  }, [segments, videoPath, videoInfo, setSplitting, setProgress, setSplitResult]);

  return (
    <>
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
        <Card size="small" style={{ marginTop: 12 }}>
          <span style={{ color: "#52c41a", fontWeight: 600 }}>切割完成！</span>
          {" "}输出目录: {splitResult}
        </Card>
      )}

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
