import { Command } from "@tauri-apps/plugin-shell";
import type {
  AudioInfo,
  ConvertParams,
  CompressParams,
  TrimParams,
} from "../types";

/** 编码器映射：输出格式 → FFmpeg 音频编码器参数 */
const AUDIO_ENCODERS: Record<string, string[]> = {
  mp3: ["-c:a", "libmp3lame"],
  wav: ["-c:a", "pcm_s16le"],
  aac: ["-c:a", "aac"],
  m4a: ["-c:a", "aac"],
  flac: ["-c:a", "flac"],
  ogg: ["-c:a", "libvorbis"],
};

/**
 * 使用 FFprobe 读取音频文件元数据。
 * 调用 ffprobe sidecar，解析 JSON 输出。
 */
export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
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

  if (output.code !== 0) {
    throw new Error(`ffprobe 执行失败: ${output.stderr}`);
  }

  const data = JSON.parse(output.stdout);
  const format = data.format || {};
  const streams: Array<Record<string, unknown>> = data.streams || [];

  // 找到音频流
  const audioStream =
    streams.find((s) => s.codec_type === "audio") || streams[0];

  if (!audioStream) {
    throw new Error("未找到音频流");
  }

  const duration = parseFloat(format.duration as string) || 0;
  const bitrate = Math.round(
    parseInt(format.bit_rate as string, 10) / 1000,
  );
  const sampleRate = parseInt(audioStream.sample_rate as string, 10) || 44100;
  const channels = (audioStream.channels as number) || 2;
  const fileSize = parseInt(format.size as string, 10) || 0;

  // 从 ffprobe 数据获取真实格式
  // 优先用 codec_name（如 mp3, aac, flac, vorbis, pcm_s16le）
  const codecName = (audioStream.codec_name as string) || "";
  const formatName = (format.format_name as string) || "";

  let audioFormat = "";
  // 编解码器名直接匹配已知格式
  const codecToFormat: Record<string, string> = {
    mp3: "mp3",
    mp3float: "mp3",
    aac: "aac",
    flac: "flac",
    vorbis: "ogg",
    pcm_s16le: "wav",
    pcm_s24le: "wav",
    pcm_f32le: "wav",
    alac: "m4a",
    opus: "ogg",
  };

  if (codecToFormat[codecName]) {
    audioFormat = codecToFormat[codecName];
  } else if (formatName) {
    // format_name 可能是复合值如 "mov,mp4,m4a,aac"
    const knownFormats = ["mp3", "wav", "aac", "m4a", "flac", "ogg"];
    const matched = knownFormats.find((f) => formatName.includes(f));
    audioFormat = matched || formatName.split(",")[0];
  }

  if (!audioFormat) {
    audioFormat = filePath.split(".").pop()?.toLowerCase() || "unknown";
  }

  return {
    duration,
    format: audioFormat,
    bitrate,
    sampleRate,
    channels,
    fileSize,
  };
}

/**
 * 音频格式转换。
 * 根据输出文件扩展名自动选择编码器。
 */
export async function convertAudio(
  inputPath: string,
  outputPath: string,
  _params: ConvertParams,
): Promise<void> {
  const ext = outputPath.split(".").pop()?.toLowerCase() || "";
  const encoderArgs = AUDIO_ENCODERS[ext];
  if (!encoderArgs) {
    throw new Error(`不支持的输出格式: ${ext}`);
  }

  const args = ["-y", "-i", inputPath, ...encoderArgs, outputPath];
  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`格式转换失败: ${result.stderr}`);
  }
}

/**
 * 音频压缩。
 * 保持原格式，调整比特率和采样率。
 */
export async function compressAudio(
  inputPath: string,
  outputPath: string,
  params: CompressParams,
): Promise<void> {
  const args = ["-y", "-i", inputPath, "-b:a", `${params.bitrate}k`];

  if (params.sampleRate) {
    args.push("-ar", String(params.sampleRate));
  }

  args.push(outputPath);

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`压缩失败: ${result.stderr}`);
  }
}

/**
 * 音频裁剪。
 * 同格式使用 -c copy 无损拷贝，跨格式走重编码。
 */
export async function trimAudio(
  inputPath: string,
  outputPath: string,
  params: TrimParams,
): Promise<void> {
  const inputExt = inputPath.split(".").pop()?.toLowerCase() || "";
  const outputExt = outputPath.split(".").pop()?.toLowerCase() || "";
  const sameFormat = inputExt === outputExt;

  const args = [
    "-y",
    "-ss",
    String(params.startTime),
    "-to",
    String(params.endTime),
    "-i",
    inputPath,
  ];

  if (sameFormat) {
    args.push("-c", "copy");
  } else {
    const encoderArgs = AUDIO_ENCODERS[outputExt];
    if (encoderArgs) {
      args.push(...encoderArgs);
    }
  }

  args.push(outputPath);

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`裁剪失败: ${result.stderr}`);
  }
}
