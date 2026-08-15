import React, { useCallback, useState } from "react";
import { Button, Radio, Select, Slider, message } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { compressVideo, getVideoFileInfo } from "../../utils/ffmpeg";
import { useAppStore } from "../../store/segmentStore";
import type { VideoProcessResult } from "../../types";

const OUTPUT_FORMATS = ["mp4", "mov", "mkv", "avi", "webm"];

interface QualityPreset {
  label: string;
  crf: number;
  preset: string;
  description: string;
}

const QUALITY_PRESETS: QualityPreset[] = [
  { label: "高质量", crf: 18, preset: "slow", description: "画质损失极小" },
  { label: "标准压缩", crf: 23, preset: "medium", description: "兼顾画质和体积" },
  { label: "强力压缩", crf: 28, preset: "medium", description: "文件更小" },
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

const VideoGeneral: React.FC = () => {
  const videoPath = useAppStore((s) => s.videoPath);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const videoFileName = useAppStore((s) => s.videoFileName);
  const setVideoProcessing = useAppStore((s) => s.setVideoProcessing);
  const setVideoProcessResult = useAppStore((s) => s.setVideoProcessResult);

  const currentExt = videoFileName.split(".").pop()?.toLowerCase() || "mp4";

  const [outputFormat, setOutputFormat] = useState<string>(currentExt);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  // 默认高质量压缩
  const [presetIndex, setPresetIndex] = useState(0);
  const [resolution, setResolution] = useState("original");
  const [customCrf, setCustomCrf] = useState(18);
  const [customPreset, setCustomPreset] = useState("slow");

  const crf = mode === "preset" ? QUALITY_PRESETS[presetIndex].crf : customCrf;

  const handleProcess = useCallback(async () => {
    if (!videoPath || !videoInfo) return;

    const isConvert = outputFormat !== currentExt;
    const baseName = videoFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}${isConvert ? "_converted" : "_compressed"}.${outputFormat}`;

    try {
      const selected = await save({
        defaultPath,
        filters: [
          {
            name: `${outputFormat.toUpperCase()} 文件`,
            extensions: [outputFormat],
          },
        ],
      });
      if (!selected) return;

      setVideoProcessing(true);
      setVideoProcessResult(null);

      await compressVideo(videoPath, selected, {
        crf,
        resolution,
        preset: mode === "custom" ? customPreset : QUALITY_PRESETS[presetIndex].preset,
      });

      const outputFileInfo = await getVideoFileInfo(selected);
      const inputFileInfo = await getVideoFileInfo(videoPath);

      const result: VideoProcessResult = {
        inputPath: videoPath,
        outputPath: selected,
        inputFormat: currentExt,
        outputFormat,
        inputSize: inputFileInfo.fileSize,
        outputSize: outputFileInfo.fileSize,
        inputResolution: `${videoInfo.width}x${videoInfo.height}`,
        outputResolution: `${outputFileInfo.width}x${outputFileInfo.height}`,
        duration: videoInfo.duration,
        taskType: isConvert ? "convert" : "compress",
      };

      setVideoProcessResult(result);
      message.success(isConvert ? "格式转换完成！" : "压缩完成！");
    } catch (err) {
      message.error(`处理失败: ${err}`);
    } finally {
      setVideoProcessing(false);
    }
  }, [
    videoPath,
    videoInfo,
    videoFileName,
    currentExt,
    outputFormat,
    crf,
    resolution,
    mode,
    presetIndex,
    customPreset,
    setVideoProcessing,
    setVideoProcessResult,
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Output format */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13 }}>输出格式：</span>
        <Select
          value={outputFormat}
          onChange={setOutputFormat}
          style={{ width: 180 }}
          options={OUTPUT_FORMATS.map((f) => ({
            label: f === currentExt ? `${f.toUpperCase()}（原格式）` : f.toUpperCase(),
            value: f,
          }))}
        />
      </div>

      {/* Quality mode */}
      <Radio.Group
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 4 }}
      >
        <Radio value="preset">预设压缩</Radio>
        <Radio value="custom">自定义参数</Radio>
      </Radio.Group>

      {mode === "preset" ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
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

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 8,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <Button
          type="primary"
          icon={<ToolOutlined />}
          onClick={handleProcess}
        >
          开始处理
        </Button>
      </div>
    </div>
  );
};

export default VideoGeneral;
