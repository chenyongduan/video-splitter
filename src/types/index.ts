export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  filename: string;
}

export interface SplitProgress {
  current: number;
  total: number;
  percent: number;
}

// ===== Video Processing =====

export type VideoFunctionTab = "convert" | "compress" | "split";

export type VideoTaskType = "convert" | "compress" | "split";

export interface VideoConvertParams {
  outputFormat: string;
}

export interface VideoCompressParams {
  crf: number;
  resolution?: string;
  preset?: string;
}

export interface VideoProcessResult {
  inputPath: string;
  outputPath: string;
  inputFormat: string;
  outputFormat: string;
  inputSize: number;
  outputSize: number;
  inputResolution: string;
  outputResolution: string;
  duration: number;
  taskType: VideoTaskType;
}

// ===== Global =====
export type AppTab = "video" | "audio";

// ===== Audio =====
export interface AudioInfo {
  duration: number;
  format: string;
  bitrate: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

export type AudioTaskType = "convert" | "compress" | "trim";

export interface ConvertParams {
  outputFormat: string;
}

export interface CompressParams {
  bitrate: number;
  sampleRate?: number;
}

export interface TrimParams {
  startTime: number;
  endTime: number;
}

export interface AudioProcessResult {
  inputPath: string;
  outputPath: string;
  inputFormat: string;
  outputFormat: string;
  inputSize: number;
  outputSize: number;
  inputBitrate: number;
  outputBitrate: number;
  inputSampleRate: number;
  outputSampleRate: number;
  duration: number;
  taskType: AudioTaskType;
}
