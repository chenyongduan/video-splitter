import { Command } from "@tauri-apps/plugin-shell";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

// ===== iOS =====

const IOS_SIZES = [1024, 512, 256, 128, 64, 32];

interface IosIconEntry {
  filename: string;
  idiom: string;
  scale: string;
  size: string;
}

/**
 * 导出 iOS App 图标集。
 * 在 outputDir 下创建 ios/AppIcon.appiconset/ 目录。
 * 源图为 512 时跳过 1024 尺寸。
 */
export async function exportIosIcons(
  inputPath: string,
  outputDir: string,
  sourceSize: number,
): Promise<{ outputDir: string; fileCount: number }> {
  const appIconDir = await join(outputDir, "ios", "AppIcon.appiconset");
  await mkdir(appIconDir, { recursive: true });

  const entries: IosIconEntry[] = [];
  let fileCount = 0;

  for (const size of IOS_SIZES) {
    // 源图为 512 时跳过 1024
    if (sourceSize < size) continue;

    const filename = `Icon-${size}.png`;
    const outputPath = await join(appIconDir, filename);

    if (size === sourceSize) {
      // 直接复制：用 FFmpeg 无滤镜输出（无损复制）
      const cmd = Command.sidecar("binaries/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        outputPath,
      ]);
      const result = await cmd.execute();
      if (result.code !== 0) {
        throw new Error(`复制 ${size}x${size} 失败: ${result.stderr}`);
      }
    } else {
      // 缩放
      const cmd = Command.sidecar("binaries/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale=${size}:${size}`,
        outputPath,
      ]);
      const result = await cmd.execute();
      if (result.code !== 0) {
        throw new Error(`生成 ${size}x${size} 失败: ${result.stderr}`);
      }
    }

    fileCount++;

    // 生成 Contents.json 条目
    const scales: string[] = [];
    if (size === 1024) {
      scales.push("1x");
    } else if (size === 512) {
      scales.push("2x");
    } else if (size === 256) {
      scales.push("1x", "2x");
    } else if (size === 128) {
      scales.push("2x");
    } else if (size === 64) {
      scales.push("2x", "3x");
    } else if (size === 32) {
      scales.push("2x");
    }

    for (const scale of scales) {
      const scaleNum = scale === "1x" ? 1 : scale === "2x" ? 2 : 3;
      const ptSize = size / scaleNum;
      entries.push({
        filename,
        idiom: "universal",
        scale: `${scaleNum}x`,
        size: `${ptSize}x${ptSize}`,
      });
    }
  }

  // 生成 Contents.json
  const contents = {
    images: entries.map((e) => ({
      filename: e.filename,
      idiom: e.idiom,
      scale: e.scale,
      size: e.size,
    })),
    info: {
      version: 1,
      author: "xcode",
    },
  };

  const contentsPath = await join(appIconDir, "Contents.json");
  const encoder = new TextEncoder();
  await writeFile(contentsPath, encoder.encode(JSON.stringify(contents, null, 2)));
  fileCount++; // Contents.json 也算一个文件

  return { outputDir: appIconDir, fileCount };
}

// ===== Android =====

const ANDROID_DENSITIES = [
  { folder: "mipmap-mdpi", size: 48 },
  { folder: "mipmap-hdpi", size: 72 },
  { folder: "mipmap-xhdpi", size: 96 },
  { folder: "mipmap-xxhdpi", size: 144 },
  { folder: "mipmap-xxxhdpi", size: 192 },
];

/**
 * 导出 Android mipmap 图标。
 * 在 outputDir 下创建 android/ 子目录及各密度目录。
 */
export async function exportAndroidIcons(
  inputPath: string,
  outputDir: string,
): Promise<{ outputDir: string; fileCount: number }> {
  const androidDir = await join(outputDir, "android");
  await mkdir(androidDir, { recursive: true });

  let fileCount = 0;

  for (const density of ANDROID_DENSITIES) {
    const densityDir = await join(androidDir, density.folder);
    await mkdir(densityDir, { recursive: true });

    const outputPath = await join(densityDir, "ic_launcher.png");

    const cmd = Command.sidecar("binaries/ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `scale=${density.size}:${density.size}`,
      outputPath,
    ]);
    const result = await cmd.execute();
    if (result.code !== 0) {
      throw new Error(
        `生成 ${density.folder} (${density.size}x${density.size}) 失败: ${result.stderr}`,
      );
    }

    fileCount++;
  }

  return { outputDir: androidDir, fileCount };
}
