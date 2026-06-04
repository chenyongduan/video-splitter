import { Command } from "@tauri-apps/plugin-shell";
import { mkdir } from "@tauri-apps/plugin-fs";
import type {
  Segment,
  VideoInfo,
  SplitProgress,
  VideoConvertParams,
  VideoCompressParams,
} from "../types";

type ProgressCallback = (progress: SplitProgress) => void;

/**
 * Get video information by running ffmpeg -i and parsing stderr output.
 * Uses the bundled FFmpeg sidecar binary.
 */
export async function getVideoInfo(filePath: string): Promise<VideoInfo> {
  // Use ffprobe for accurate metadata
  const probeCommand = Command.sidecar("binaries/ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const probeOutput = await probeCommand.execute();
  const data = JSON.parse(probeOutput.stdout);

  // Determine format from file extension (MP4 and MOV share the same container)
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const knownVideoFormats = ["mp4", "mov", "mkv", "avi", "webm"];
  const formatName = knownVideoFormats.includes(ext) ? ext : (data.format?.format_name || "").split(",")[0]?.trim() || "";

  const duration = parseFloat(data.format?.duration) || 0;

  const videoStream = (data.streams || []).find(
    (s: Record<string, unknown>) => s.codec_type === "video",
  );

  const width: number = videoStream?.width || 0;
  const height: number = videoStream?.height || 0;

  let fps = 30;
  if (videoStream?.r_frame_rate) {
    const [num, den] = String(videoStream.r_frame_rate).split("/").map(Number);
    if (den > 0) fps = num / den;
  }

  return { duration, width, height, fps, format: formatName };
}

/**
 * Split a video into segments using the bundled FFmpeg sidecar binary.
 * Iterates over segments sequentially, calling ffmpeg -c copy for each.
 * Calls onProgress after each segment completes.
 * Returns the output directory path on success.
 */
export async function splitVideo(
  inputPath: string,
  segments: Segment[],
  onProgress?: ProgressCallback,
): Promise<string> {
  // Create output directory: input_dir/filename_segments/
  const pathParts = inputPath.replace(/\\/g, "/").split("/");
  const fileName = pathParts.pop() || "video.mp4";
  const inputDir = pathParts.join("/");
  const stem = fileName.replace(/\.[^.]+$/, "");
  const outputDir = `${inputDir}/${stem}_segments`;

  // Create output directory if it doesn't exist
  await mkdir(outputDir, { recursive: true });

  const total = segments.length;

  for (let i = 0; i < total; i++) {
    const seg = segments[i];
    const outputFile = `${outputDir}/${seg.filename}`;

    const args = [
      "-y",
      "-ss",
      String(seg.start),
      "-to",
      String(seg.end),
      "-i",
      inputPath,
      "-c",
      "copy",
      outputFile,
    ];

    const command = Command.sidecar("binaries/ffmpeg", args);
    const result = await command.execute();

    if (result.code !== 0) {
      throw new Error(
        `ffmpeg failed for segment ${i + 1} (${seg.start}s-${seg.end}s): ${result.stderr}`,
      );
    }

    onProgress?.({
      current: i + 1,
      total,
      percent: Math.round(((i + 1) / total) * 100),
    });
  }

  return outputDir;
}

// ===== Video encoder mapping =====

const VIDEO_ENCODERS: Record<string, string[]> = {
  mp4: ["-c:v", "libx264", "-c:a", "aac"],
  mov: ["-c:v", "libx264", "-c:a", "aac"],
  mkv: ["-c:v", "libx264", "-c:a", "aac"],
  avi: ["-c:v", "libx264", "-c:a", "mp3"],
  webm: ["-c:v", "libvpx-vp9", "-c:a", "libvorbis"],
};

/**
 * Convert video to a different format using FFmpeg re-encoding.
 */
export async function convertVideo(
  inputPath: string,
  outputPath: string,
  _params: VideoConvertParams,
): Promise<void> {
  const ext = outputPath.split(".").pop()?.toLowerCase() || "mp4";
  const encoderArgs = VIDEO_ENCODERS[ext] || VIDEO_ENCODERS["mp4"];

  const args = [
    "-y",
    "-i",
    inputPath,
    ...encoderArgs,
    "-pix_fmt",
    "yuv420p",
    ...(ext === "mp4" || ext === "mov" ? ["-movflags", "+faststart"] : []),
    outputPath,
  ];

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`视频转换失败: ${result.stderr}`);
  }
}

/**
 * Compress video using CRF quality control with optional resolution scaling.
 */
export async function compressVideo(
  inputPath: string,
  outputPath: string,
  params: VideoCompressParams,
): Promise<void> {
  const ext = outputPath.split(".").pop()?.toLowerCase() || "mp4";
  const encoderArgs = VIDEO_ENCODERS[ext] || VIDEO_ENCODERS["mp4"];

  const args = ["-y", "-i", inputPath];

  // CRF quality (lower = better, range 0-51)
  args.push("-crf", String(params.crf));

  // Encoding speed preset
  if (params.preset) {
    args.push("-preset", params.preset);
  }

  // Resolution scaling via video filter
  if (params.resolution && params.resolution !== "original") {
    const [w, h] = params.resolution.split("x").map(Number);
    if (w > 0 && h > 0) {
      args.push("-vf", `scale=${w}:${h}`);
    }
  }

  args.push(
    ...encoderArgs,
    "-pix_fmt",
    "yuv420p",
    ...(ext === "mp4" || ext === "mov" ? ["-movflags", "+faststart"] : []),
    outputPath,
  );

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`视频压缩失败: ${result.stderr}`);
  }
}

/**
 * Get video file metadata using ffprobe.
 * Returns file size, format, width, and height.
 */
export async function getVideoFileInfo(
  filePath: string,
): Promise<{ fileSize: number; format: string; width: number; height: number }> {
  const command = Command.sidecar("binaries/ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const output = await command.execute();
  const data = JSON.parse(output.stdout);

  const format = (data.format?.format_name || "").split(",").pop()?.trim() || "";
  const fileSize = Number(data.format?.size) || 0;

  const videoStream = (data.streams || []).find(
    (s: Record<string, unknown>) => s.codec_type === "video",
  );

  return {
    fileSize,
    format,
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
  };
}
