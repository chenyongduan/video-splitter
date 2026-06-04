import React, { useCallback, useState } from "react";
import { Button, Radio, Select, Slider, message } from "antd";
import { CompressOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { compressVideo, getVideoFileInfo } from "../../utils/ffmpeg";
import { useAppStore } from "../../store/segmentStore";
import type { VideoProcessResult } from "../../types";

interface QualityPreset {
  label: string;
  crf: number;
  description: string;
}

const QUALITY_PRESETS: QualityPreset[] = [
  { label: "高质量", crf: 18, description: "画质损失极小" },
  { label: "标准压缩", crf: 23, description: "兼顾画质和体积" },
  { label: "强力压缩", crf: 28, description: "文件更小" },
];

const RESOLUTION_OPTIONS = [
  { label: "原始分辨率", value: "original" },
  { label: "1080p", value: "1920x1080" },
  { label: "720p", value: "1280x720" },
  { label: "480p", value: "854x480" },
];

const PRESET_OPTIONS = [
  { label: "超快", value: "ultrafast" },
  { label: "快速", value: "fast" },
  { label: "中等", value: "medium" },
  { label: "慢速", value: "slow" },
];

const VideoCompressor: React.FC = () => {
  const videoPath = useAppStore((s) => s.videoPath);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const videoFileName = useAppStore((s) => s.videoFileName);
  const setVideoProcessing = useAppStore((s) => s.setVideoProcessing);
  const setVideoProcessResult = useAppStore((s) => s.setVideoProcessResult);

  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetIndex, setPresetIndex] = useState(1);
  const [resolution, setResolution] = useState("original");
  const [customCrf, setCustomCrf] = useState(23);
  const [customPreset, setCustomPreset] = useState("medium");

  const crf = mode === "preset" ? QUALITY_PRESETS[presetIndex].crf : customCrf;

  const handleCompress = useCallback(async () => {
    if (!videoPath || !videoInfo) return;

    const ext = videoFileName.split(".").pop()?.toLowerCase() || "mp4";
    const baseName = videoFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_compressed.${ext}`;

    try {
      const selected = await save({
        defaultPath,
        filters: [
          {
            name: `${ext.toUpperCase()} 文件`,
            extensions: [ext],
          },
        ],
      });
      if (!selected) return;

      setVideoProcessing(true);
      setVideoProcessResult(null);

      await compressVideo(videoPath, selected, {
        crf,
        resolution,
        preset: mode === "custom" ? customPreset : "medium",
      });

      const outputFileInfo = await getVideoFileInfo(selected);
      const inputFileInfo = await getVideoFileInfo(videoPath);

      const result: VideoProcessResult = {
        inputPath: videoPath,
        outputPath: selected,
        inputFormat: ext,
        outputFormat: ext,
        inputSize: inputFileInfo.fileSize,
        outputSize: outputFileInfo.fileSize,
        inputResolution: `${videoInfo.width}x${videoInfo.height}`,
        outputResolution: `${outputFileInfo.width}x${outputFileInfo.height}`,
        duration: videoInfo.duration,
        taskType: "compress",
      };

      setVideoProcessResult(result);
      message.success("压缩完成！");
    } catch (err) {
      message.error(`压缩失败: ${err}`);
    } finally {
      setVideoProcessing(false);
    }
  }, [
    videoPath,
    videoInfo,
    videoFileName,
    crf,
    resolution,
    mode,
    customPreset,
    setVideoProcessing,
    setVideoProcessResult,
  ]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        border: "1px solid #e8e8e8",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ marginBottom: 8 }}
        >
          <Radio value="preset">预设压缩</Radio>
          <Radio value="custom">自定义参数</Radio>
        </Radio.Group>

        {mode === "preset" ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {QUALITY_PRESETS.map((p, i) => (
                <div
                  key={i}
                  onClick={() => setPresetIndex(i)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 8,
                    border: `2px solid ${presetIndex === i ? "#1677ff" : "#d9d9d9"}`,
                    cursor: "pointer",
                    textAlign: "center",
                    background: presetIndex === i ? "#e6f4ff" : "#fff",
                    transition: "all 0.2s",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: presetIndex === i ? "#1677ff" : "#333",
                    }}
                  >
                    {p.label}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      margin: "4px 0",
                    }}
                  >
                    CRF {p.crf}
                  </div>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {p.description}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <span style={{ fontSize: 13 }}>目标分辨率：</span>
              <Radio.Group
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                {RESOLUTION_OPTIONS.map((opt) => (
                  <Radio.Button key={opt.value} value={opt.value}>
                    {opt.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                质量 (CRF): {customCrf}
              </div>
              <Slider
                min={0}
                max={51}
                step={1}
                value={customCrf}
                onChange={setCustomCrf}
                marks={{
                  0: "无损",
                  18: "高质量",
                  28: "标准",
                  51: "最低",
                }}
              />
            </div>
            <div
              style={{ display: "flex", gap: 16, alignItems: "center" }}
            >
              <div>
                <span style={{ fontSize: 13 }}>分辨率：</span>
                <Select
                  value={resolution}
                  onChange={setResolution}
                  style={{ width: 140 }}
                  options={RESOLUTION_OPTIONS.map((opt) => ({
                    label: opt.label,
                    value: opt.value,
                  }))}
                />
              </div>
              <div>
                <span style={{ fontSize: 13 }}>编码速度：</span>
                <Select
                  value={customPreset}
                  onChange={setCustomPreset}
                  style={{ width: 120 }}
                  options={PRESET_OPTIONS.map((opt) => ({
                    label: opt.label,
                    value: opt.value,
                  }))}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<CompressOutlined />}
          onClick={handleCompress}
        >
          开始压缩
        </Button>
      </div>
    </div>
  );
};

export default VideoCompressor;
