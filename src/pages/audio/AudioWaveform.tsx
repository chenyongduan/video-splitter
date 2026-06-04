import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Space } from "antd";
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
} from "@ant-design/icons";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";

const AudioWaveform: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFunctionTab = useAppStore((s) => s.audioFunctionTab);

  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [regionStart, setRegionStart] = useState<number>(0);
  const [regionEnd, setRegionEnd] = useState<number>(0);

  // Store trim range for AudioTrimmer to read
  const trimRangeRef = useRef({ start: 0, end: 0 });

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__audioTrimRange = {
      get: () => ({
        start: trimRangeRef.current.start,
        end: trimRangeRef.current.end,
      }),
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__audioTrimRange;
    };
  }, []);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioPath) return;

    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#91caff",
      progressColor: "#1677ff",
      cursorColor: "#1677ff",
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;
    wavesurferRef.current = ws;

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    const src = convertFileSrc(audioPath);
    ws.load(src);

    ws.on("ready", () => {
      const duration = ws.getDuration();
      setRegionEnd(duration);
      trimRangeRef.current = { start: 0, end: duration };

      regions.addRegion({
        start: 0,
        end: duration,
        color: "rgba(22, 119, 255, 0.15)",
        drag: true,
        resize: true,
      });
    });

    regions.on("region-updated", (region) => {
      const start = region.start;
      const end = region.end;
      setRegionStart(start);
      setRegionEnd(end);
      trimRangeRef.current = { start, end };
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioPath]);

  const togglePlay = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.playPause();
  }, []);

  const handlePlayRegion = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.play(regionStart, regionEnd);
  }, [regionStart, regionEnd]);

  if (!audioPath || !audioInfo) return null;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        border: "1px solid #e8e8e8",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔊 波形预览</span>
        <Space size={8}>
          <Button
            size="small"
            icon={
              isPlaying ? (
                <PauseCircleOutlined />
              ) : (
                <PlayCircleOutlined />
              )
            }
            onClick={togglePlay}
          >
            {isPlaying ? "暂停" : "播放"}
          </Button>
          {audioFunctionTab === "trim" && (
            <Button size="small" type="primary" onClick={handlePlayRegion}>
              播放选中
            </Button>
          )}
        </Space>
      </div>

      <div
        ref={containerRef}
        style={{
          background: "#f0f5ff",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 6,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#999",
        }}
      >
        <span>00:00</span>
        {audioFunctionTab === "trim" && (
          <span style={{ color: "#1677ff" }}>
            选中：{formatTime(regionStart)} — {formatTime(regionEnd)}
          </span>
        )}
        <span>{formatTime(audioInfo.duration)}</span>
      </div>
    </div>
  );
};

export default AudioWaveform;
