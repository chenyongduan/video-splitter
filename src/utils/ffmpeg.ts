import { Command } from "@tauri-apps/plugin-shell";
import { mkdir } from "@tauri-apps/plugin-fs";
import type { Segment, VideoInfo, SplitProgress } from "../types";

type ProgressCallback = (progress: SplitProgress) => void;

/**
 * Get video information by running ffmpeg -i and parsing stderr output.
 * Uses the bundled FFmpeg sidecar binary.
 */
export async function getVideoInfo(filePath: string): Promise<VideoInfo> {
  const command = Command.sidecar("binaries/ffmpeg", ["-i", filePath]);
  const output = await command.execute();

  // ffmpeg exits with code 1 when no output file is specified — that's expected
  const stderr = output.stderr;

  const duration = parseDuration(stderr);
  const { width, height, fps } = parseVideoStream(stderr);

  return { duration, width, height, fps };
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

/**
 * Parse "Duration: HH:MM:SS.ms" from ffmpeg stderr output
 */
function parseDuration(stderr: string): number {
  for (const line of stderr.split("\n")) {
    const idx = line.indexOf("Duration:");
    if (idx !== -1) {
      const rest = line.slice(idx + "Duration:".length);
      const timeStr = rest.split(",")[0].trim();
      return parseHMS(timeStr);
    }
  }
  throw new Error("Failed to parse video duration from ffmpeg output");
}

/**
 * Parse resolution and fps from the video stream line in ffmpeg stderr
 */
function parseVideoStream(stderr: string): {
  width: number;
  height: number;
  fps: number;
} {
  for (const line of stderr.split("\n")) {
    if (!line.includes("Video:")) continue;

    let width = 0;
    let height = 0;
    let fps = 30;

    // Find resolution pattern (e.g., "1920x1080")
    for (const part of line.split(/[\s,]/)) {
      const xPos = part.indexOf("x");
      if (xPos !== -1) {
        const w = parseInt(part.slice(0, xPos), 10);
        const h = parseInt(part.slice(xPos + 1), 10);
        if (w > 0 && h > 0) {
          width = w;
          height = h;
        }
      }
    }

    // Parse fps from "30 fps" or "29.97 fps" or "24000/1001 fps"
    const fpsIdx = line.indexOf("fps");
    if (fpsIdx !== -1) {
      const before = line.slice(0, fpsIdx);
      const tokens = before.split(/[\s,]/).filter((t) => t.length > 0);
      const last = tokens[tokens.length - 1];
      if (last?.includes("/")) {
        const [num, den] = last.split("/").map(Number);
        if (den > 0) fps = num / den;
      } else if (last) {
        const v = parseFloat(last);
        if (!isNaN(v)) fps = v;
      }
    }

    if (width > 0 && height > 0) {
      return { width, height, fps };
    }
  }
  throw new Error("Failed to parse video stream info from ffmpeg output");
}

/**
 * Parse "HH:MM:SS.ms" to seconds
 */
function parseHMS(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length >= 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) {
      throw new Error(`Invalid time format: ${timeStr}`);
    }
    return h * 3600 + m * 60 + s;
  }
  throw new Error(`Invalid time format: ${timeStr}`);
}
