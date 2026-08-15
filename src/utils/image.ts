import { Command } from "@tauri-apps/plugin-shell";
import type {
  ImageInfo,
  ImageConvertParams,
  ImageCompressParams,
  ImageResizeParams,
  ImageCropParams,
  ImageRotateParams,
  ImageCropRect,
  ImageOutputSettings,
} from "../types";

/**
 * 使用 FFprobe 读取图片文件元数据。
 */
export async function getImageInfo(filePath: string): Promise<ImageInfo> {
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

  const imageStream =
    streams.find((s) => s.codec_type === "video") || streams[0];

  if (!imageStream) {
    throw new Error("未找到图片流");
  }

  const width = (imageStream.width as number) || 0;
  const height = (imageStream.height as number) || 0;
  const fileSize = parseInt(format.size as string, 10) || 0;

  // 从 pix_fmt 推断色彩模式
  const pixFmt = (imageStream.pix_fmt as string) || "";
  let colorMode = "RGB";
  if (pixFmt.includes("rgba") || pixFmt.includes("argb")) {
    colorMode = "RGBA";
  } else if (pixFmt.includes("pal8")) {
    colorMode = "索引色";
  } else if (pixFmt.includes("gray")) {
    colorMode = "灰度";
  } else if (pixFmt.includes("ya") || pixFmt.includes("gray16")) {
    colorMode = "灰度+Alpha";
  } else if (pixFmt.includes("rgb") || pixFmt.includes("bgr")) {
    colorMode = pixFmt.includes("a") ? "RGBA" : "RGB";
  }

  const bitDepth =
    (imageStream.bits_per_raw_sample as number) ||
    (imageStream.bits_per_pixel as number) ||
    8;

  // 获取格式
  const codecName = (imageStream.codec_name as string) || "";
  const formatName = (format.format_name as string) || "";

  const codecToFormat: Record<string, string> = {
    png: "png",
    jpeg: "jpeg",
    mjpeg: "jpeg",
    webp: "webp",
    bmp: "bmp",
    ico: "ico",
    tiff: "tiff",
    gif: "gif",
  };

  let imageFormat = "";
  if (codecToFormat[codecName]) {
    imageFormat = codecToFormat[codecName];
  } else if (formatName) {
    const knownFormats = [
      "png",
      "jpeg",
      "jpg",
      "webp",
      "bmp",
      "ico",
      "tiff",
      "gif",
    ];
    const matched = knownFormats.find((f) => formatName.includes(f));
    imageFormat = matched || formatName.split(",")[0];
  }

  if (!imageFormat) {
    imageFormat = filePath.split(".").pop()?.toLowerCase() || "unknown";
  }

  // 规范化 jpeg → jpg
  if (imageFormat === "jpeg") imageFormat = "jpg";

  return {
    width,
    height,
    format: imageFormat,
    fileSize,
    colorMode,
    bitDepth,
  };
}

/**
 * 图片格式转换。
 * FFmpeg 根据输出文件扩展名自动选择编码器。
 */
export async function convertImage(
  inputPath: string,
  outputPath: string,
  _params: ImageConvertParams,
): Promise<void> {
  const args = ["-y", "-i", inputPath];

  // ICO 格式最大支持 256x256，需要先获取输入尺寸并缩放
  const outputExt = outputPath.split(".").pop()?.toLowerCase() || "";
  if (outputExt === "ico") {
    // 读取输入图片尺寸
    const probeCmd = Command.sidecar("binaries/ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      inputPath,
    ]);
    const probeResult = await probeCmd.execute();
    if (probeResult.code === 0) {
      const probeData = JSON.parse(probeResult.stdout);
      const stream = probeData.streams?.[0];
      const w = stream?.width as number || 0;
      const h = stream?.height as number || 0;
      if (w > 256 || h > 256) {
        const scaleW = Math.min(w, 256);
        const scaleH = Math.min(h, 256);
        args.push("-vf", `scale=${scaleW}:${scaleH}`);
      }
    }
  }

  args.push(outputPath);
  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`格式转换失败: ${result.stderr}`);
  }
}

/**
 * 图片压缩。
 * 根据图片格式使用不同的质量参数。
 */
export async function compressImage(
  inputPath: string,
  outputPath: string,
  params: ImageCompressParams,
): Promise<void> {
  const ext = inputPath.split(".").pop()?.toLowerCase() || "";
  const args = ["-y", "-i", inputPath];

  if (ext === "jpg" || ext === "jpeg") {
    // JPEG quality: 2 (best) → 31 (worst), invert from 1-100
    const q = Math.round(31 - ((params.quality - 1) / 99) * 29);
    args.push("-q:v", String(q));
  } else if (ext === "webp") {
    // WebP quality via FFmpeg's -q:v flag (0-100)
    args.push("-q:v", String(params.quality));
  } else if (ext === "png") {
    // PNG is lossless — compression_level only affects DEFLATE effort, not visual quality.
    // Always use max compression (9) to ensure output is no larger than the original.
    // Add -pred mixed for better prediction-based compression.
    args.push("-compression_level", "9", "-pred", "mixed");
  }

  args.push(outputPath);

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`压缩失败: ${result.stderr}`);
  }
}

/**
 * 图片尺寸调整。
 * 支持锁定比例（高度自动计算）和自由调整两种模式。
 */
export async function resizeImage(
  inputPath: string,
  outputPath: string,
  params: ImageResizeParams,
): Promise<void> {
  const scaleFilter = params.keepAspectRatio
    ? `scale=${params.width}:-1`
    : `scale=${params.width}:${params.height}`;

  const args = ["-y", "-i", inputPath, "-vf", scaleFilter, outputPath];
  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`尺寸调整失败: ${result.stderr}`);
  }
}

/**
 * 图片裁剪。
 */
export async function cropImage(
  inputPath: string,
  outputPath: string,
  params: ImageCropParams,
): Promise<void> {
  const cropFilter = `crop=${params.width}:${params.height}:${params.x}:${params.y}`;
  const args = ["-y", "-i", inputPath, "-vf", cropFilter, outputPath];
  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`裁剪失败: ${result.stderr}`);
  }
}

/**
 * 图片旋转/翻转。
 */
export async function rotateImage(
  inputPath: string,
  outputPath: string,
  params: ImageRotateParams,
): Promise<void> {
  const filters: string[] = [];

  // 旋转
  if (params.rotation === 90) {
    filters.push("transpose=1");
  } else if (params.rotation === 180) {
    filters.push("transpose=1,transpose=1");
  } else if (params.rotation === 270) {
    filters.push("transpose=2");
  }

  // 翻转
  if (params.flipHorizontal) {
    filters.push("hflip");
  }
  if (params.flipVertical) {
    filters.push("vflip");
  }

  const args = [
    "-y",
    "-i",
    inputPath,
    ...(filters.length > 0 ? ["-vf", filters.join(",")] : []),
    outputPath,
  ];

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`旋转/翻转失败: ${result.stderr}`);
  }
}

export interface ImageProcessParams {
  /** FFmpeg 滤镜链（有序：旋转/翻转 → 裁剪 → 缩放） */
  filters: string[];
  /** 输出编码质量参数（如 ["-q:v", "20"]），无损/无参格式为空数组 */
  qualityArgs: string[];
  /** 应用全部操作后的最终尺寸（ICO 钳制前的值） */
  finalDimensions: { width: number; height: number };
  /** 解析后的实际输出格式（"original" 已替换为图片实际格式） */
  format: string;
}

/** 旋转值规范化到 0/90/180/270 */
function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  return (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

/**
 * 计算应用旋转（和可选裁剪）后的图片尺寸。
 * crop 的 w/h 为 0 或 null 表示未裁剪，返回旋转后的完整尺寸。
 */
export function getEditedDimensions(
  imageInfo: ImageInfo,
  rotation: number,
  crop: ImageCropRect | null
): { width: number; height: number } {
  const rot = normalizeRotation(rotation);
  const swapped = rot === 90 || rot === 270;
  const base = swapped
    ? { width: imageInfo.height, height: imageInfo.width }
    : { width: imageInfo.width, height: imageInfo.height };
  if (crop && crop.w > 0 && crop.h > 0) {
    return { width: crop.w, height: crop.h };
  }
  return base;
}

/**
 * 把编辑状态 + 输出设置解析为一次 FFmpeg 调用所需的参数。
 * 滤镜链顺序：旋转/翻转 → 裁剪 → 缩放。
 * 裁剪坐标定义在"旋转+翻转后"的图上，与预览所见一致。
 */
export function resolveImageProcessParams(
  imageInfo: ImageInfo,
  edit: {
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    crop: ImageCropRect | null;
  },
  output: ImageOutputSettings
): ImageProcessParams {
  const rotation = normalizeRotation(edit.rotation);
  const format =
    output.format === "original" ? imageInfo.format : output.format;

  const filters: string[] = [];

  // 旋转
  if (rotation === 90) {
    filters.push("transpose=1");
  } else if (rotation === 180) {
    filters.push("transpose=1,transpose=1");
  } else if (rotation === 270) {
    filters.push("transpose=2");
  }
  // 翻转
  if (edit.flipH) filters.push("hflip");
  if (edit.flipV) filters.push("vflip");

  // 裁剪（坐标在旋转+翻转后的图上）
  if (edit.crop && edit.crop.w > 0 && edit.crop.h > 0) {
    filters.push(
      `crop=${edit.crop.w}:${edit.crop.h}:${edit.crop.x}:${edit.crop.y}`
    );
  }

  // 缩放
  const edited = getEditedDimensions(imageInfo, rotation, edit.crop);
  let finalW = edited.width;
  let finalH = edited.height;
  if (output.sizeMode === "percent") {
    const p = output.scalePercent / 100;
    finalW = Math.max(1, Math.round(edited.width * p));
    finalH = Math.max(1, Math.round(edited.height * p));
    filters.push(`scale=${finalW}:${finalH}`);
  } else if (output.sizeMode === "custom") {
    // 锁定比例时以宽度为基准（UI 层保证宽高联动）
    if (output.lockAspectRatio && output.width > 0) {
      finalW = output.width;
      finalH = Math.max(
        1,
        Math.round((output.width / edited.width) * edited.height)
      );
      filters.push(`scale=${output.width}:-1`);
    } else if (output.width > 0 && output.height > 0) {
      finalW = output.width;
      finalH = output.height;
      filters.push(`scale=${output.width}:${output.height}`);
    }
  }

  // ICO 最大 256×256：链尾钳制（保持比例）
  if (format === "ico" && (finalW > 256 || finalH > 256)) {
    filters.push("scale='min(iw,256)':'min(ih,256)'");
  }

  // 质量参数按输出格式
  const qualityArgs: string[] = [];
  if (format === "jpg") {
    // JPEG quality: 2 (best) → 31 (worst)，从 1-100 反算
    const q = Math.round(31 - ((output.quality - 1) / 99) * 29);
    qualityArgs.push("-q:v", String(q));
  } else if (format === "webp") {
    qualityArgs.push("-q:v", String(output.quality));
  } else if (format === "png") {
    // PNG 无损，compression_level 只影响压缩力度
    qualityArgs.push("-compression_level", "9", "-pred", "mixed");
  }

  return {
    filters,
    qualityArgs,
    finalDimensions: { width: finalW, height: finalH },
    format,
  };
}

/**
 * 统一图片处理：一次 FFmpeg 调用完成旋转/翻转/裁剪/缩放/格式/质量。
 */
export async function processImage(
  inputPath: string,
  outputPath: string,
  params: ImageProcessParams
): Promise<void> {
  const args = ["-y", "-i", inputPath];
  if (params.filters.length > 0) {
    args.push("-vf", params.filters.join(","));
  }
  args.push(...params.qualityArgs, outputPath);

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`图片处理失败: ${result.stderr}`);
  }
}
