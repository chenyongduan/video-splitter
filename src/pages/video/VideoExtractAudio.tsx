import React, { useCallback } from "react";
import { Button, message } from "antd";
import { AudioOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { extractAudio, getVideoFileInfo } from "../../utils/ffmpeg";
import { useAppStore } from "../../store/segmentStore";
import type { VideoProcessResult } from "../../types";

const VideoExtractAudio: React.FC = () => {
  const videoPath = useAppStore((s) => s.videoPath);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const videoFileName = useAppStore((s) => s.videoFileName);
  const setVideoProcessing = useAppStore((s) => s.setVideoProcessing);
  const setVideoProcessResult = useAppStore((s) => s.setVideoProcessResult);

  const handleExtract = useCallback(async () => {
    if (!videoPath || !videoInfo) return;

    const baseName = videoFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_audio.mp3`;

    try {
      const selected = await save({
        defaultPath,
        filters: [
          {
            name: "MP3 文件",
            extensions: ["mp3"],
          },
        ],
      });
      if (!selected) return;

      setVideoProcessing(true);
      setVideoProcessResult(null);

      await extractAudio(videoPath, selected);

      const outputFileInfo = await getVideoFileInfo(selected);

      const result: VideoProcessResult = {
        inputPath: videoPath,
        outputPath: selected,
        inputFormat: videoFileName.split(".").pop()?.toLowerCase() || "",
        outputFormat: "mp3",
        inputSize: videoInfo.fileSize,
        outputSize: outputFileInfo.fileSize,
        inputResolution: `${videoInfo.width}x${videoInfo.height}`,
        outputResolution: "-",
        duration: videoInfo.duration,
        taskType: "extractAudio",
      };

      setVideoProcessResult(result);
      message.success("音频导出完成！");
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setVideoProcessing(false);
    }
  }, [videoPath, videoInfo, videoFileName, setVideoProcessing, setVideoProcessResult]);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div style={{ fontSize: 13, color: "#666" }}>
        从视频中提取音频轨道，导出为 MP3 格式
      </div>
      <div style={{ flex: 1 }} />
      <Button
        type="primary"
        icon={<AudioOutlined />}
        onClick={handleExtract}
      >
        导出音频
      </Button>
    </div>
  );
};

export default VideoExtractAudio;
