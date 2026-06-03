import React, { useRef, useEffect, useState } from "react";
import { Button, Space, Slider, Typography, Tag, Tooltip, message } from "antd";
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../store/segmentStore";
import { formatTime } from "../utils/format";

const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { videoPath, videoInfo, addSegment, setVideoElement } = useAppStore();
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Pending segment start time set by "设为开始"
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  // Hover time on progress bar
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [videoPath]);

  // Reset pending start when video changes
  useEffect(() => {
    setPendingStart(null);
  }, [videoPath]);

  // Register video element to store for preview
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      setVideoElement(video);
    }
    return () => {
      setVideoElement(null);
    };
  }, [videoPath, setVideoElement]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleSetStart = () => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setPendingStart(t);
    message.success(`开始时间设为 ${formatTime(t)}`);
  };

  const handleSetEnd = () => {
    const video = videoRef.current;
    if (!videoInfo || !video) return;
    const t = video.currentTime;

    if (pendingStart === null) {
      // No start set yet, treat this as start instead
      setPendingStart(t);
      message.info(`开始时间设为 ${formatTime(t)}，再点"设为结束"完成区间`);
      return;
    }

    const start = pendingStart;
    const end = t;

    if (start >= end) {
      message.error("结束时间必须大于开始时间");
      return;
    }

    if (end > videoInfo.duration) {
      message.error("结束时间不能超过视频总时长");
      return;
    }

    addSegment(start, end);
    message.success(`已添加区间 ${formatTime(start)} - ${formatTime(end)}`);
    setPendingStart(null);
  };

  if (!videoPath) return null;

  const videoSrc = convertFileSrc(videoPath);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Video */}
      <div
        style={{
          backgroundColor: "#000",
          borderRadius: 8,
          overflow: "hidden",
          maxHeight: 260,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          style={{ maxWidth: "100%", maxHeight: 260 }}
          controls={false}
          preload="auto"
        />
      </div>

      {/* Progress bar */}
      <div
        style={{ padding: "8px 0", position: "relative" }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setHoverTime(ratio * (videoInfo?.duration || 0));
          setHoverX(e.clientX - rect.left);
        }}
        onMouseLeave={() => setHoverTime(null)}
      >
        <Slider
          min={0}
          max={videoInfo?.duration || 0}
          step={0.1}
          value={currentTime}
          onChange={seekTo}
          tooltip={{ open: false }}
        />
        {hoverTime !== null && (
          <Tooltip
            open={true}
            title={formatTime(hoverTime)}
            placement="top"
          >
            <div
              style={{
                position: "absolute",
                bottom: 28,
                left: hoverX,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
            />
          </Tooltip>
        )}
      </div>

      {/* Controls row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Typography.Text>
          {formatTime(currentTime)} / {formatTime(videoInfo?.duration || 0)}
        </Typography.Text>

        {/* Pending start indicator */}
        {pendingStart !== null && (
          <Tag color="blue">
            起始点: {formatTime(pendingStart)}
          </Tag>
        )}

        <Space wrap>
          <Button
            type="primary"
            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={togglePlay}
          >
            {isPlaying ? "暂停" : "播放"}
          </Button>
          <Button onClick={() => seekTo(Math.max(0, currentTime - 5))}>
            后退5s
          </Button>
          <Button
            onClick={() =>
              seekTo(Math.min(videoInfo?.duration || 0, currentTime + 5))
            }
          >
            前进5s
          </Button>
          <Button
            type={pendingStart === null ? "default" : "default"}
            icon={<ScissorOutlined />}
            onClick={handleSetStart}
          >
            设为开始
          </Button>
          <Button
            type={pendingStart !== null ? "primary" : "default"}
            icon={<ScissorOutlined />}
            onClick={handleSetEnd}
            disabled={pendingStart !== null && currentTime <= pendingStart}
          >
            设为结束
          </Button>
          {pendingStart !== null && (
            <Button onClick={() => setPendingStart(null)}>
              取消
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
};

export default VideoPlayer;
