import React, { useCallback, useState } from "react";
import { Button, Radio, message } from "antd";
import { CompressOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { compressAudio, getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";
import type { AudioProcessResult } from "../../types";

interface PresetOption {
  label: string;
  bitrate: number;
  description: string;
}

const PRESETS: PresetOption[] = [
  { label: "高质量", bitrate: 256, description: "音质损失较小" },
  { label: "标准压缩", bitrate: 128, description: "兼顾音质和体积" },
  { label: "强力压缩", bitrate: 64, description: "文件更小" },
];

const CUSTOM_BITRATES = [64, 128, 192, 256, 320];

const AudioCompressor: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const setAudioProcessing = useAppStore((s) => s.setAudioProcessing);
  const setAudioProcessResult = useAppStore(
    (s) => s.setAudioProcessResult,
  );

  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetIndex, setPresetIndex] = useState(1);
  const [customBitrate, setCustomBitrate] = useState(128);

  const bitrate =
    mode === "preset" ? PRESETS[presetIndex].bitrate : customBitrate;

  const handleCompress = useCallback(async () => {
    if (!audioPath || !audioInfo) return;

    const ext = audioInfo.format.toLowerCase();
    const baseName = audioFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_${bitrate}kbps.${ext}`;

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

      setAudioProcessing(true);
      setAudioProcessResult(null);

      await compressAudio(audioPath, selected, { bitrate });

      const outputInfo = await getAudioInfo(selected);

      const result: AudioProcessResult = {
        inputPath: audioPath,
        outputPath: selected,
        inputFormat: audioInfo.format,
        outputFormat: outputInfo.format,
        inputSize: audioInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputBitrate: audioInfo.bitrate,
        outputBitrate: outputInfo.bitrate,
        inputSampleRate: audioInfo.sampleRate,
        outputSampleRate: outputInfo.sampleRate,
        duration: audioInfo.duration,
        taskType: "compress",
      };

      setAudioProcessResult(result);
      message.success("压缩完成！");
    } catch (err) {
      message.error(`压缩失败: ${err}`);
    } finally {
      setAudioProcessing(false);
    }
  }, [
    audioPath,
    audioInfo,
    audioFileName,
    bitrate,
    setAudioProcessing,
    setAudioProcessResult,
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
          <Radio value="custom">自定义比特率</Radio>
        </Radio.Group>

        {mode === "preset" ? (
          <div style={{ display: "flex", gap: 8 }}>
            {PRESETS.map((p, i) => (
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
                  background:
                    presetIndex === i ? "#e6f4ff" : "#fff",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color:
                      presetIndex === i ? "#1677ff" : "#333",
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
                  {p.bitrate}kbps
                </div>
                <div style={{ fontSize: 12, color: "#999" }}>
                  {p.description}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <span style={{ fontSize: 13 }}>目标比特率：</span>
            <Radio.Group
              value={customBitrate}
              onChange={(e) => setCustomBitrate(e.target.value)}
            >
              {CUSTOM_BITRATES.map((br) => (
                <Radio.Button key={br} value={br}>
                  {br}kbps
                </Radio.Button>
              ))}
            </Radio.Group>
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

export default AudioCompressor;
