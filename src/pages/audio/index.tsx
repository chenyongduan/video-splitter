import React from "react";
import { Button, Space, Typography, Tag, Alert, Spin } from "antd";
import { DeleteOutlined, FolderOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";
import AudioDropZone from "./AudioDropZone";
import AudioMetadata from "./AudioMetadata";
import AudioWaveform from "./AudioWaveform";
import AudioConverter from "./AudioConverter";
import AudioCompressor from "./AudioCompressor";
import AudioTrimmer from "./AudioTrimmer";

const { Text } = Typography;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const AudioPage: React.FC = () => {
  const isAudioLoaded = useAppStore((s) => s.isAudioLoaded);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFunctionTab = useAppStore((s) => s.audioFunctionTab);
  const setAudioFunctionTab = useAppStore((s) => s.setAudioFunctionTab);
  const audioProcessResult = useAppStore((s) => s.audioProcessResult);
  const isAudioProcessing = useAppStore((s) => s.isAudioProcessing);
  const clearAudio = useAppStore((s) => s.clearAudio);

  if (!isAudioLoaded) {
    return (
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <AudioDropZone />
      </div>
    );
  }

  const handleOpenDir = async () => {
    if (audioProcessResult?.outputPath) {
      const dir = audioProcessResult.outputPath.replace(/[/\\][^/\\]+$/, "");
      await open(dir);
    }
  };

  const tabLabels = {
    convert: "格式转换",
    compress: "音频压缩",
    trim: "音频裁剪",
  } as const;

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text strong ellipsis style={{ maxWidth: 400 }}>
            {audioFileName}
          </Text>
          {audioInfo && (
            <>
              <Tag color="blue">{audioInfo.format.toUpperCase()}</Tag>
              <Tag color="green">{formatTime(audioInfo.duration)}</Tag>
            </>
          )}
        </div>
        <Space>
          <Button icon={<DeleteOutlined />} onClick={clearAudio}>
            重新选择
          </Button>
        </Space>
      </div>

      {/* Metadata */}
      <AudioMetadata />

      {/* Waveform */}
      <AudioWaveform />

      {/* Function Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["convert", "compress", "trim"] as const).map((tab) => {
          const active = audioFunctionTab === tab;
          return (
            <div
              key={tab}
              onClick={() => setAudioFunctionTab(tab)}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                cursor: "pointer",
                background: active ? "#1677ff" : "#fff",
                color: active ? "#fff" : "#333",
                border: `1px solid ${active ? "#1677ff" : "#d9d9d9"}`,
                transition: "all 0.2s",
              }}
            >
              {tabLabels[tab]}
            </div>
          );
        })}
      </div>

      {/* Function Panel */}
      <Spin spinning={isAudioProcessing} tip="处理中...">
        {audioFunctionTab === "convert" && <AudioConverter />}
        {audioFunctionTab === "compress" && <AudioCompressor />}
        {audioFunctionTab === "trim" && <AudioTrimmer />}
      </Spin>

      {/* Result */}
      {audioProcessResult && (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message="处理完成"
          description={
            <div style={{ fontSize: 13 }}>
              <div>
                文件名：
                {audioProcessResult.inputPath.split(/[/\\]/).pop()} →{" "}
                {audioProcessResult.outputPath.split(/[/\\]/).pop()}
              </div>
              <div>
                格式：{audioProcessResult.inputFormat.toUpperCase()} →{" "}
                {audioProcessResult.outputFormat.toUpperCase()}
              </div>
              <div>
                文件大小：{formatFileSize(audioProcessResult.inputSize)} →{" "}
                {formatFileSize(audioProcessResult.outputSize)}
              </div>
              <div>
                比特率：{audioProcessResult.inputBitrate}kbps →{" "}
                {audioProcessResult.outputBitrate}kbps
              </div>
              <div>
                采样率：{audioProcessResult.inputSampleRate}Hz →{" "}
                {audioProcessResult.outputSampleRate}Hz
              </div>
              <div>时长：{formatTime(audioProcessResult.duration)}</div>
              <Button
                size="small"
                icon={<FolderOutlined />}
                style={{ marginTop: 8 }}
                onClick={handleOpenDir}
              >
                打开文件所在目录
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
};

export default AudioPage;
