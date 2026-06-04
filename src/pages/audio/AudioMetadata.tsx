import React from "react";
import { useAppStore } from "../../store/segmentStore";
import { formatTime, formatFileSize } from "../../utils/format";

const AudioMetadata: React.FC = () => {
  const audioInfo = useAppStore((s) => s.audioInfo);

  if (!audioInfo) return null;

  const channelLabel = audioInfo.channels === 1 ? "单声道" : "双声道";

  const items = [
    { label: "时长", value: formatTime(audioInfo.duration) },
    { label: "格式", value: audioInfo.format.toUpperCase() },
    { label: "文件大小", value: formatFileSize(audioInfo.fileSize) },
    { label: "比特率", value: `${audioInfo.bitrate}kbps` },
    { label: "采样率", value: `${audioInfo.sampleRate}Hz` },
    { label: "声道", value: channelLabel },
  ];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: "8px 16px",
        marginBottom: 12,
        border: "1px solid #e8e8e8",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
        }}
      >
        {items.map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AudioMetadata;
