import React, { useCallback, useEffect, useState } from "react";
import { Button, InputNumber, Typography, message } from "antd";
import { ScissorOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { trimAudio, getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";
import type { AudioProcessResult, TrimParams } from "../../types";

const AudioTrimmer: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const setAudioProcessing = useAppStore((s) => s.setAudioProcessing);
  const setAudioProcessResult = useAppStore(
    (s) => s.setAudioProcessResult,
  );

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  const duration = audioInfo?.duration || 0;

  // Sync with waveform region selection
  useEffect(() => {
    const interval = setInterval(() => {
      const trimRange = (window as unknown as Record<
        string,
        { get: () => { start: number; end: number } }
      >).__audioTrimRange;
      if (trimRange) {
        const { start, end } = trimRange.get();
        setStartTime(Math.round(start * 10) / 10);
        setEndTime(Math.round(end * 10) / 10);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleTrim = useCallback(async () => {
    if (!audioPath || !audioInfo) return;

    const params: TrimParams = { startTime, endTime };

    if (params.startTime < 0) {
      message.error("开始时间不能小于 0");
      return;
    }
    if (params.endTime > duration) {
      message.error("结束时间不能大于音频总时长");
      return;
    }
    if (params.startTime >= params.endTime) {
      message.error("结束时间必须大于开始时间");
      return;
    }

    const ext = audioInfo.format.toLowerCase();
    const baseName = audioFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_${formatTime(params.startTime).replace(/:/g, "-")}_${formatTime(params.endTime).replace(/:/g, "-")}.${ext}`;

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

      await trimAudio(audioPath, selected, params);

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
        duration: params.endTime - params.startTime,
        taskType: "trim",
      };

      setAudioProcessResult(result);
      message.success("裁剪完成！");
    } catch (err) {
      message.error(`裁剪失败: ${err}`);
    } finally {
      setAudioProcessing(false);
    }
  }, [
    audioPath,
    audioInfo,
    audioFileName,
    startTime,
    endTime,
    duration,
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
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-end",
          marginBottom: 12,
        }}
      >
        <div>
          <Typography.Text style={{ fontSize: 12, color: "#999" }}>
            开始时间
          </Typography.Text>
          <InputNumber
            min={0}
            max={duration}
            step={0.1}
            value={startTime}
            onChange={(v) => setStartTime(v || 0)}
            addonAfter={formatTime(startTime)}
            style={{ width: 180 }}
          />
        </div>
        <div>
          <Typography.Text style={{ fontSize: 12, color: "#999" }}>
            结束时间
          </Typography.Text>
          <InputNumber
            min={0}
            max={duration}
            step={0.1}
            value={endTime}
            onChange={(v) => setEndTime(v || 0)}
            addonAfter={formatTime(endTime)}
            style={{ width: 180 }}
          />
        </div>
        <div
          style={{ fontSize: 13, color: "#666", alignSelf: "center" }}
        >
          时长：{formatTime(endTime - startTime)}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<ScissorOutlined />}
          onClick={handleTrim}
        >
          开始裁剪
        </Button>
      </div>
    </div>
  );
};

export default AudioTrimmer;
