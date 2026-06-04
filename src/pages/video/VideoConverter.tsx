import React, { useCallback, useState } from "react";
import { Button, Select, message } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { convertVideo, getVideoFileInfo } from "../../utils/ffmpeg";
import { useAppStore } from "../../store/segmentStore";
import type { VideoProcessResult } from "../../types";

const OUTPUT_FORMATS = ["mp4", "mov", "mkv", "avi", "webm"];

const VideoConverter: React.FC = () => {
  const videoPath = useAppStore((s) => s.videoPath);
  const videoInfo = useAppStore((s) => s.videoInfo);
  const videoFileName = useAppStore((s) => s.videoFileName);
  const setVideoProcessing = useAppStore((s) => s.setVideoProcessing);
  const setVideoProcessResult = useAppStore((s) => s.setVideoProcessResult);

  const currentExt = videoFileName.split(".").pop()?.toLowerCase() || "mp4";
  const [outputFormat, setOutputFormat] = useState<string>(
    OUTPUT_FORMATS.find((f) => f !== currentExt) || "mp4",
  );

  const availableFormats = OUTPUT_FORMATS.filter((f) => f !== currentExt);

  const handleConvert = useCallback(async () => {
    if (!videoPath || !videoInfo) return;

    const baseName = videoFileName.replace(/\.[^.]+$/, "");
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

      setVideoProcessing(true);
      setVideoProcessResult(null);

      await convertVideo(videoPath, selected, { outputFormat });

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
        taskType: "convert",
      };

      setVideoProcessResult(result);
      message.success("格式转换完成！");
    } catch (err) {
      message.error(`转换失败: ${err}`);
    } finally {
      setVideoProcessing(false);
    }
  }, [
    videoPath,
    videoInfo,
    videoFileName,
    currentExt,
    outputFormat,
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
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>
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
    </div>
  );
};

export default VideoConverter;
