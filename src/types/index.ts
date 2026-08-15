export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  fileSize: number;
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

export type VideoFunctionTab = "convert" | "compress" | "split" | "extractAudio";

export type VideoTaskType = "convert" | "compress" | "split" | "extractAudio";

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
export type AppTab = "video" | "audio" | "image" | "icon" | "json" | "qrcode" | "log";

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

// ===== Image =====

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  fileSize: number;
  colorMode: string;
  bitDepth: number;
}

export type ImageTaskType = "convert" | "compress" | "resize" | "crop" | "rotate";

export interface ImageConvertParams {
  outputFormat: string;
}

export interface ImageCompressParams {
  quality: number;
}

export interface ImageResizeParams {
  width: number;
  height: number;
  keepAspectRatio: boolean;
}

export interface ImageCropParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageRotateParams {
  rotation: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export interface ImageProcessResult {
  inputPath: string;
  outputPath: string;
  inputFormat: string;
  outputFormat: string;
  inputSize: number;
  outputSize: number;
  inputDimensions: string;
  outputDimensions: string;
  taskType: ImageTaskType;
}

// ===== Icon =====

export interface IconInfo {
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export interface IconExportResult {
  platform: "ios" | "android" | "tauri";
  outputDir: string;
  fileCount: number;
}

// ==================== JSON ====================

export interface VisibleLine {
  line_number: number;
  content: string;
  node_path: string;
  is_collapsible: boolean;
  collapsed: boolean;
  depth: number;
  is_editable: boolean;
}

export interface JsonValidationResult {
  valid: boolean;
  error_message: string | null;
  error_line: number | null;
  error_column: number | null;
}

// ===== JSON Search =====

export interface SearchResult {
  expanded_line: number;
  visible_line: number;
  content: string;
  match_start: number;
  match_end: number;
}
