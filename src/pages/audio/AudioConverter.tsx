import React, { useCallback, useState } from "react";
import { Button, Select, message } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { convertAudio, getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";
import type { AudioProcessResult } from "../../types";

const OUTPUT_FORMATS = ["mp3", "wav", "aac", "m4a", "flac", "ogg"];

const AudioConverter: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const setAudioProcessing = useAppStore((s) => s.setAudioProcessing);
  const setAudioProcessResult = useAppStore(
    (s) => s.setAudioProcessResult,
  );

  const [outputFormat, setOutputFormat] = useState<string>(() => {
    const current = audioInfo?.format?.toLowerCase() || "";
    if (current === "wav") return "mp3";
    return "wav";
  });

  const availableFormats = OUTPUT_FORMATS.filter(
    (f) => f !== audioInfo?.format?.toLowerCase(),
  );

  // 如果当前选中的格式被过滤掉了（和源格式相同），自动切换
  if (!availableFormats.includes(outputFormat) && availableFormats.length > 0) {
    setOutputFormat(availableFormats[0]);
  }

  const handleConvert = useCallback(async () => {
    if (!audioPath || !audioInfo) return;

    const baseName = audioFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_converted.${outputFormat}`;

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

      setAudioProcessing(true);
      setAudioProcessResult(null);

      await convertAudio(audioPath, selected, { outputFormat });

      const outputInfo = await getAudioInfo(selected);

      const result: AudioProcessResult = {
        inputPath: audioPath,
        outputPath: selected,
        inputFormat: audioInfo.format,
        outputFormat,
        inputSize: audioInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputBitrate: audioInfo.bitrate,
        outputBitrate: outputInfo.bitrate,
        inputSampleRate: audioInfo.sampleRate,
        outputSampleRate: outputInfo.sampleRate,
        duration: audioInfo.duration,
        taskType: "convert",
      };

      setAudioProcessResult(result);
      message.success("格式转换完成！");
    } catch (err) {
      message.error(`转换失败: ${err}`);
    } finally {
      setAudioProcessing(false);
    }
  }, [
    audioPath,
    audioInfo,
    audioFileName,
    outputFormat,
    setAudioProcessing,
    setAudioProcessResult,
  ]);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div>
        <div
          style={{ fontSize: 12, color: "#999", marginBottom: 4 }}
        >
          输出格式
        </div>
        <Select
          value={outputFormat}
          onChange={setOutputFormat}
          style={{ minWidth: 120 }}
          options={availableFormats.map((f) => ({
            label: f.toUpperCase(),
            value: f,
          }))}
        />
      </div>
      <div style={{ flex: 1 }} />
      <Button
        type="primary"
        icon={<SwapOutlined />}
        onClick={handleConvert}
      >
        开始转换
      </Button>
    </div>
  );
};

export default AudioConverter;
