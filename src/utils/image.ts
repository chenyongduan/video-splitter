import { Command } from "@tauri-apps/plugin-shell";
import type {
  ImageInfo,
  ImageConvertParams,
  ImageCompressParams,
  ImageResizeParams,
  ImageCropParams,
  ImageRotateParams,
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
