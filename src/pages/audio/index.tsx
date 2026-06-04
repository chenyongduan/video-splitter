import React, { useCallback } from "react";
import { Button, Space, Typography, Spin, message } from "antd";
import { DeleteOutlined, FolderOpenOutlined, SwapOutlined, CompressOutlined, ScissorOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";
import { getAudioInfo } from "../../utils/audio";
import ProcessNotification from "../../components/ProcessNotification";
import AudioDropZone from "./AudioDropZone";
import AudioMetadata from "./AudioMetadata";
import AudioWaveform from "./AudioWaveform";
import AudioConverter from "./AudioConverter";
import AudioCompressor from "./AudioCompressor";
import AudioTrimmer from "./AudioTrimmer";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = ["mp3", "wav", "aac", "m4a", "flac", "ogg"];

const AudioPage: React.FC = () => {
  const isAudioLoaded = useAppStore((s) => s.isAudioLoaded);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const audioFunctionTab = useAppStore((s) => s.audioFunctionTab);
  const setAudioFunctionTab = useAppStore((s) => s.setAudioFunctionTab);
  const audioProcessResult = useAppStore((s) => s.audioProcessResult);
  const isAudioProcessing = useAppStore((s) => s.isAudioProcessing);
  const clearAudio = useAppStore((s) => s.clearAudio);
  const setAudioFile = useAppStore((s) => s.setAudioFile);
  const setAudioProcessResult = useAppStore((s) => s.setAudioProcessResult);

  const handleLoadAudio = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "音频文件",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileName = filePath.split(/[/\\]/).pop() || "audio.mp3";
      const info = await getAudioInfo(filePath);
      setAudioFile(filePath, fileName, info);
    } catch (err) {
      message.error(`加载失败: ${err}`);
    }
  }, [setAudioFile]);

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

  const tabItems = [
    { key: "convert" as const, label: "格式转换", icon: <SwapOutlined /> },
    { key: "compress" as const, label: "音频压缩", icon: <CompressOutlined /> },
    { key: "trim" as const, label: "音频裁剪", icon: <ScissorOutlined /> },
  ];

  return (
    <>
      <ProcessNotification
        result={audioProcessResult}
        extraLines={
          audioProcessResult ? (
            <>
              <div>
                比特率：{audioProcessResult.inputBitrate}kbps →{" "}
                {audioProcessResult.outputBitrate}kbps
              </div>
              <div>
                采样率：{audioProcessResult.inputSampleRate}Hz →{" "}
                {audioProcessResult.outputSampleRate}Hz
              </div>
              <div>时长：{formatTime(audioProcessResult.duration)}</div>
            </>
          ) : undefined
        }
        onDone={() => setAudioProcessResult(null)}
      />
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
            <Text strong ellipsis style={{ maxWidth: 600 }}>
              {audioFileName}
            </Text>
          </div>
          <Space>
            <Button icon={<FolderOpenOutlined />} onClick={handleLoadAudio}>
              选择音频
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={clearAudio}>
              清除
            </Button>
          </Space>
        </div>

        {/* Metadata */}
        <AudioMetadata />

        {/* Waveform */}
        <AudioWaveform />

        {/* Function Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {tabItems.map((tab) => {
            const active = audioFunctionTab === tab.key;
            return (
              <div
                key={tab.key}
                onClick={() => setAudioFunctionTab(tab.key)}
                style={{
                  padding: "6px 18px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: active ? "#1677ff" : "#fff",
                  color: active ? "#fff" : "#555",
                  border: `1px solid ${active ? "#1677ff" : "#d9d9d9"}`,
                  transition: "all 0.2s",
                  userSelect: "none",
                }}
              >
                {tab.icon}
                {tab.label}
              </div>
            );
          })}
        </div>

        {/* Function Panel */}
        <Spin spinning={isAudioProcessing} tip="处理中...">
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #e8e8e8",
              padding: 16,
            }}
          >
            {audioFunctionTab === "convert" && <AudioConverter />}
            {audioFunctionTab === "compress" && <AudioCompressor />}
            {audioFunctionTab === "trim" && <AudioTrimmer />}
          </div>
        </Spin>
      </div>
    </>
  );
};

export default AudioPage;
