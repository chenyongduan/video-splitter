export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
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
