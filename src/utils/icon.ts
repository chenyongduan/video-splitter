import { Command } from "@tauri-apps/plugin-shell";
import { mkdir, writeFile, copyFile, remove } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

// ===== iOS =====

/**
 * 标准 iOS AppIcon 图标规格。
 * 每个 entry 对应 Contents.json 中的一条 image 记录，
 * pixelSize 是实际生成的 PNG 像素尺寸 (ptSize × scale)。
 */
const IOS_ICON_SPECS = [
  // iPhone
  { size: "20x20", idiom: "iphone", scale: "2x", pixelSize: 40 },
  { size: "20x20", idiom: "iphone", scale: "3x", pixelSize: 60 },
  { size: "29x29", idiom: "iphone", scale: "2x", pixelSize: 58 },
  { size: "29x29", idiom: "iphone", scale: "3x", pixelSize: 87 },
  { size: "40x40", idiom: "iphone", scale: "2x", pixelSize: 80 },
  { size: "40x40", idiom: "iphone", scale: "3x", pixelSize: 120 },
  { size: "60x60", idiom: "iphone", scale: "2x", pixelSize: 120 },
  { size: "60x60", idiom: "iphone", scale: "3x", pixelSize: 180 },
  // iPad
  { size: "20x20", idiom: "ipad", scale: "2x", pixelSize: 40 },
  { size: "29x29", idiom: "ipad", scale: "2x", pixelSize: 58 },
  { size: "40x40", idiom: "ipad", scale: "2x", pixelSize: 80 },
  { size: "76x76", idiom: "ipad", scale: "2x", pixelSize: 152 },
  { size: "83.5x83.5", idiom: "ipad", scale: "2x", pixelSize: 167 },
  // App Store
  { size: "1024x1024", idiom: "ios-marketing", scale: "1x", pixelSize: 1024 },
] as const;

/**
 * 导出 iOS App 图标集。
 * 在 outputDir 下创建 ios/AppIcon.appiconset/ 目录。
 * 严格遵循 Apple 标准 Contents.json 格式，区分 iPhone / iPad / ios-marketing。
 */
export async function exportIosIcons(
  inputPath: string,
  outputDir: string,
  sourceSize: number,
): Promise<{ outputDir: string; fileCount: number }> {
  const appIconDir = await join(outputDir, "ios", "AppIcon.appiconset");
  await mkdir(appIconDir, { recursive: true });

  let fileCount = 0;
  const generatedSizes = new Map<number, string>(); // pixelSize → filename（避免重复生成）

  for (const spec of IOS_ICON_SPECS) {
    if (sourceSize < spec.pixelSize) continue;

    const filename = `icon-${spec.size}@${spec.scale}.png`;

    // 同像素尺寸的图标只生成一次（如 40x40@2x iPhone 和 20x20@2x iPad 都是 40px）
    if (!generatedSizes.has(spec.pixelSize)) {
      const outputPath = await join(appIconDir, filename);

      if (spec.pixelSize === sourceSize) {
        // 直接复制，无需缩放
        const cmd = Command.sidecar("binaries/ffmpeg", [
          "-y",
          "-i",
          inputPath,
          outputPath,
        ]);
        const result = await cmd.execute();
        if (result.code !== 0) {
          throw new Error(`复制 ${spec.pixelSize}x${spec.pixelSize} 失败: ${result.stderr}`);
        }
      } else {
        // 缩放
        const cmd = Command.sidecar("binaries/ffmpeg", [
          "-y",
          "-i",
          inputPath,
          "-vf",
          `scale=${spec.pixelSize}:${spec.pixelSize}`,
          outputPath,
        ]);
        const result = await cmd.execute();
        if (result.code !== 0) {
          throw new Error(`生成 ${spec.pixelSize}x${spec.pixelSize} 失败: ${result.stderr}`);
        }
      }

      generatedSizes.set(spec.pixelSize, filename);
      fileCount++;
    }
  }

  // 生成 Contents.json
  const images = IOS_ICON_SPECS
    .filter((spec) => sourceSize >= spec.pixelSize)
    .map((spec) => {
      const filename = generatedSizes.get(spec.pixelSize)!;
      return {
        size: spec.size,
        idiom: spec.idiom,
        filename,
        scale: spec.scale,
      };
    });

  const contents = {
    images,
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

// ===== Tauri =====

const TAURI_ICONS = [
  { filename: "32x32.png", size: 32 },
  { filename: "128x128.png", size: 128 },
  { filename: "128x128@2x.png", size: 256 },
  { filename: "icon.ico", size: 256 },
  { filename: "icon.png", size: 1024 },
  // Windows Store tiles
  { filename: "Square30x30Logo.png", size: 30 },
  { filename: "Square44x44Logo.png", size: 44 },
  { filename: "Square71x71Logo.png", size: 71 },
  { filename: "Square89x89Logo.png", size: 89 },
  { filename: "Square107x107Logo.png", size: 107 },
  { filename: "Square142x142Logo.png", size: 142 },
  { filename: "Square150x150Logo.png", size: 150 },
  { filename: "Square284x284Logo.png", size: 284 },
  { filename: "Square310x310Logo.png", size: 310 },
  { filename: "StoreLogo.png", size: 50 },
];

/**
 * macOS 标准 iconset 文件名及对应像素尺寸。
 * 用于 iconutil 生成 .icns 文件。
 */
const ICONSET_ENTRIES = [
  { name: "icon_16x16.png", px: 16 },
  { name: "icon_16x16@2x.png", px: 32 },
  { name: "icon_32x32.png", px: 32 },
  { name: "icon_32x32@2x.png", px: 64 },
  { name: "icon_128x128.png", px: 128 },
  { name: "icon_128x128@2x.png", px: 256 },
  { name: "icon_256x256.png", px: 256 },
  { name: "icon_256x256@2x.png", px: 512 },
  { name: "icon_512x512.png", px: 512 },
  { name: "icon_512x512@2x.png", px: 1024 },
];

/**
 * 生成标准 macOS .icns 文件。
 * 创建 .iconset 目录，用 FFmpeg 生成各尺寸 PNG，再调用 iconutil 转换。
 */
async function buildIcns(
  inputPath: string,
  icnsOutputPath: string,
  sourceSize: number,
): Promise<void> {
  // iconset 目录放在 icns 同级，名为 icon.iconset
  const parentDir = icnsOutputPath.substring(0, icnsOutputPath.lastIndexOf("/"));
  const iconsetDir = await join(parentDir, "icon.iconset");
  await mkdir(iconsetDir, { recursive: true });

  try {
    // 1. 用 FFmpeg 生成各尺寸 PNG（同像素尺寸只生成一次，其余复制）
    const generated = new Map<number, string>();

    for (const entry of ICONSET_ENTRIES) {
      if (sourceSize < entry.px) continue;

      const destPath = await join(iconsetDir, entry.name);

      if (generated.has(entry.px)) {
        // 同像素尺寸已生成过，直接复制
        await copyFile(generated.get(entry.px)!, destPath);
        continue;
      }

      const args =
        entry.px === sourceSize
          ? ["-y", "-i", inputPath, destPath]
          : ["-y", "-i", inputPath, "-vf", `scale=${entry.px}:${entry.px}`, destPath];

      const result = await Command.sidecar("binaries/ffmpeg", args).execute();
      if (result.code !== 0) {
        throw new Error(`ICNS: 生成 ${entry.name} 失败: ${result.stderr}`);
      }

      generated.set(entry.px, destPath);
    }

    // 2. 用 macOS iconutil 将 iconset 转换为 icns
    const cmd = Command.create("iconutil", [
      "-c",
      "icns",
      "-o",
      icnsOutputPath,
      iconsetDir,
    ]);
    const result = await cmd.execute();
    if (result.code !== 0) {
      throw new Error(`ICNS: iconutil 生成失败: ${result.stderr}`);
    }
  } finally {
    // 清理临时 iconset 目录
    try {
      await remove(iconsetDir, { recursive: true });
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 导出 Tauri 应用图标。
 * 在 outputDir 下创建 tauri/icons/ 目录，包含 tauri.conf.json 所需的全部图标。
 * icon.icns 使用标准 ICNS 二进制格式生成（非简单 PNG 重命名）。
 */
export async function exportTauriIcons(
  inputPath: string,
  outputDir: string,
  sourceSize: number,
): Promise<{ outputDir: string; fileCount: number }> {
  const tauriDir = await join(outputDir, "tauri", "icons");
  await mkdir(tauriDir, { recursive: true });

  let fileCount = 0;

  for (const icon of TAURI_ICONS) {
    if (sourceSize < icon.size) continue;

    const outputPath = await join(tauriDir, icon.filename);

    if (icon.size === sourceSize) {
      const cmd = Command.sidecar("binaries/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        outputPath,
      ]);
      const result = await cmd.execute();
      if (result.code !== 0) {
        throw new Error(`生成 ${icon.filename} 失败: ${result.stderr}`);
      }
    } else {
      const cmd = Command.sidecar("binaries/ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale=${icon.size}:${icon.size}`,
        outputPath,
      ]);
      const result = await cmd.execute();
      if (result.code !== 0) {
        throw new Error(`生成 ${icon.filename} 失败: ${result.stderr}`);
      }
    }

    fileCount++;
  }

  // 生成标准 ICNS 文件（包含 32/64/128/256/512/1024 多尺寸 PNG）
  const icnsPath = await join(tauriDir, "icon.icns");
  await buildIcns(inputPath, icnsPath, sourceSize);
  fileCount++;

  return { outputDir: tauriDir, fileCount };
}
