# Icon Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level "图标" tab that lets users upload a 512×512 or 1024×1024 image and separately export iOS and Android app icon sets.

**Architecture:** New page at `src/pages/icon/` following the existing page pattern (drop zone → preview → operation panel). Reuses `getImageInfo` from `utils/image.ts` for metadata. New `utils/icon.ts` encapsulates FFmpeg scaling commands, directory creation, and Contents.json generation. State added to the existing Zustand store following the established pattern.

**Tech Stack:** FFmpeg sidecar (scale filter), Tauri plugin-fs (mkdir), Tauri plugin-dialog (file/folder pickers), Ant Design 6, React 19, Zustand 5.

---

### Task 1: Add icon types to `types/index.ts`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add AppTab value and icon types**

Append after the existing `ImageProcessResult` interface:

```typescript
// ===== Icon =====

export interface IconInfo {
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export interface IconExportResult {
  platform: "ios" | "android";
  outputDir: string;
  fileCount: number;
}
```

Update the `AppTab` type from:

```typescript
export type AppTab = "video" | "audio" | "image";
```

to:

```typescript
export type AppTab = "video" | "audio" | "image" | "icon";
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(icon): add icon types and AppTab value"
```

---

### Task 2: Add icon state to Zustand store

**Files:**
- Modify: `src/store/segmentStore.ts`

- [ ] **Step 1: Import icon types and add state fields + actions**

Add `IconInfo` to the import from `"../types"`.

Add these fields to the `AppState` interface, after the Image section:

```typescript
  // Icon state
  iconPath: string;
  iconFileName: string;
  iconInfo: IconInfo | null;
  isIconLoaded: boolean;
  isIconProcessing: boolean;
  iconProcessResult: IconExportResult | null;

  // Icon actions
  setIconFile: (path: string, fileName: string, info: IconInfo) => void;
  clearIcon: () => void;
  setIconProcessing: (val: boolean) => void;
  setIconProcessResult: (result: IconExportResult | null) => void;
```

Add the corresponding initial state and actions to the store implementation:

Initial state (after image fields):

```typescript
  // Icon
  iconPath: "",
  iconFileName: "",
  iconInfo: null,
  isIconLoaded: false,
  isIconProcessing: false,
  iconProcessResult: null,
```

Actions:

```typescript
  // Icon actions
  setIconFile: (path, fileName, info) =>
    set({
      iconPath: path,
      iconFileName: fileName,
      iconInfo: info,
      isIconLoaded: true,
      iconProcessResult: null,
    }),

  clearIcon: () =>
    set({
      iconPath: "",
      iconFileName: "",
      iconInfo: null,
      isIconLoaded: false,
      isIconProcessing: false,
      iconProcessResult: null,
    }),

  setIconProcessing: (val) => set({ isIconProcessing: val }),
  setIconProcessResult: (result) => set({ iconProcessResult: result }),
```

Also add `IconExportResult` to the import from `"../types"`.

- [ ] **Step 2: Commit**

```bash
git add src/store/segmentStore.ts
git commit -m "feat(icon): add icon state and actions to Zustand store"
```

---

### Task 3: Create `utils/icon.ts` — FFmpeg icon scaling and export logic

**Files:**
- Create: `src/utils/icon.ts`

- [ ] **Step 1: Write the icon utility module**

```typescript
import { Command } from "@tauri-apps/plugin-shell";
import { mkdir, exists } from "@tauri-apps/plugin-fs";
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
    // 尺寸 = scale × pixel size，例如 2x 的 64pt = 128px
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
  // 使用 FFmpeg 无法写 JSON，用 Blob + Tauri FS 写入
  const { writeFile } = await import("@tauri-apps/plugin-fs");
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
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/icon.ts
git commit -m "feat(icon): add icon export utilities (iOS + Android)"
```

---

### Task 4: Create `IconDropZone` component

**Files:**
- Create: `src/pages/icon/IconDropZone.tsx`

- [ ] **Step 1: Write the drop zone component**

Follows the same pattern as `ImageDropZone.tsx`, but restricted to PNG/JPG and validates square + size constraints.

```typescript
import React, { useCallback, useEffect, useState, useRef } from "react";
import { Card, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getImageInfo } from "../../utils/image";
import { useAppStore } from "../../store/segmentStore";

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg"];

const IconDropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const setIconFile = useAppStore((s) => s.setIconFile);

  const loadIconFile = useCallback(
    async (filePath: string) => {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        message.error(`不支持的格式: .${ext}，仅支持 PNG、JPG 格式`);
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "icon.png";

      try {
        const info = await getImageInfo(filePath);

        // 校验：必须是正方形
        if (info.width !== info.height) {
          message.error("图片必须是正方形（宽高相等）");
          return;
        }

        // 校验：尺寸必须是 512 或 1024
        if (info.width !== 512 && info.width !== 1024) {
          message.error("图片尺寸必须是 512×512 或 1024×1024");
          return;
        }

        setIconFile(filePath, fileName, {
          width: info.width,
          height: info.height,
          format: info.format,
          fileSize: info.fileSize,
        });
      } catch (err) {
        message.error(`加载失败: ${err}，文件可能已损坏`);
      }
    },
    [setIconFile],
  );

  const handleSelectFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片文件",
            extensions: ALLOWED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;
      await loadIconFile(selected as string);
    } catch (err) {
      message.error(`选择文件失败: ${err}`);
    }
  }, [loadIconFile]);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          loadIconFile(files[0]);
        }
      } else if (event.payload.type === "over") {
        setIsDragOver(true);
      } else if (event.payload.type === "leave") {
        setIsDragOver(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadIconFile]);

  return (
    <Card style={{ marginTop: 48 }}>
      <div
        onClick={handleSelectFile}
        style={{
          padding: "60px 0",
          textAlign: "center",
          cursor: "pointer",
          borderRadius: 8,
          border: `2px dashed ${isDragOver ? "#1890ff" : "#d9d9d9"}`,
          background: isDragOver ? "#e6f7ff" : "transparent",
          transition: "all 0.3s",
        }}
      >
        <InboxOutlined
          style={{ fontSize: 48, color: isDragOver ? "#1890ff" : "#999" }}
        />
        <p style={{ fontSize: 16, marginTop: 16 }}>
          拖拽图片到此处，或点击选择文件
        </p>
        <p style={{ color: "#999" }}>
          支持 512×512 或 1024×1024 的 PNG、JPG 格式
        </p>
      </div>
    </Card>
  );
};

export default IconDropZone;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/icon/IconDropZone.tsx
git commit -m "feat(icon): add IconDropZone component"
```

---

### Task 5: Create `IconExporter` component

**Files:**
- Create: `src/pages/icon/IconExporter.tsx`

- [ ] **Step 1: Write the exporter component with iOS and Android panels**

```typescript
import React, { useCallback, useState } from "react";
import { Button, message, Space } from "antd";
import {
  AppleOutlined,
  AndroidOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { exportIosIcons, exportAndroidIcons } from "../../utils/icon";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

const IconExporter: React.FC = () => {
  const iconPath = useAppStore((s) => s.iconPath);
  const iconInfo = useAppStore((s) => s.iconInfo);
  const isIconProcessing = useAppStore((s) => s.isIconProcessing);
  const setIconProcessing = useAppStore((s) => s.setIconProcessing);
  const iconProcessResult = useAppStore((s) => s.iconProcessResult);
  const setIconProcessResult = useAppStore((s) => s.setIconProcessResult);

  const [iosPath, setIosPath] = useState("");
  const [androidPath, setAndroidPath] = useState("");

  const handleSelectIosPath = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setIosPath(selected as string);
      }
    } catch (err) {
      message.error(`选择目录失败: ${err}`);
    }
  }, []);

  const handleSelectAndroidPath = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setAndroidPath(selected as string);
      }
    } catch (err) {
      message.error(`选择目录失败: ${err}`);
    }
  }, []);

  const handleExportIos = useCallback(async () => {
    if (!iconPath || !iconInfo) return;
    if (!iosPath) {
      message.warning("请先选择输出目录");
      return;
    }

    setIconProcessing(true);
    try {
      const result = await exportIosIcons(iconPath, iosPath, iconInfo.width);
      setIconProcessResult({
        platform: "ios",
        outputDir: result.outputDir,
        fileCount: result.fileCount,
      });
      message.success(`iOS 图标导出完成，共 ${result.fileCount} 个文件`);
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setIconProcessing(false);
    }
  }, [iconPath, iconInfo, iosPath, setIconProcessing, setIconProcessResult]);

  const handleExportAndroid = useCallback(async () => {
    if (!iconPath || !iconInfo) return;
    if (!androidPath) {
      message.warning("请先选择输出目录");
      return;
    }

    setIconProcessing(true);
    try {
      const result = await exportAndroidIcons(iconPath, androidPath);
      setIconProcessResult({
        platform: "android",
        outputDir: result.outputDir,
        fileCount: result.fileCount,
      });
      message.success(`Android 图标导出完成，共 ${result.fileCount} 个文件`);
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setIconProcessing(false);
    }
  }, [iconPath, iconInfo, androidPath, setIconProcessing, setIconProcessResult]);

  const handleOpenDir = useCallback(async (dir: string) => {
    try {
      await revealItemInDir(dir);
    } catch {
      // ignore
    }
  }, []);

  if (!iconPath || !iconInfo) return null;

  const sourceSize = iconInfo.width;

  // iOS 尺寸列表
  const iosSizes = [1024, 512, 256, 128, 64, 32].filter(
    (s) => sourceSize >= s,
  );

  // Android 密度列表
  const androidDensities = [
    { folder: "mipmap-mdpi", size: 48 },
    { folder: "mipmap-hdpi", size: 72 },
    { folder: "mipmap-xhdpi", size: 96 },
    { folder: "mipmap-xxhdpi", size: 144 },
    { folder: "mipmap-xxxhdpi", size: 192 },
  ];

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* iOS Panel */}
      <div
        style={{
          flex: 1,
          minWidth: 280,
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e8e8e8",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <AppleOutlined style={{ fontSize: 18 }} />
          iOS 图标
        </div>

        {/* 尺寸列表 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {iosSizes.map((s) => (
            <span
              key={s}
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
                background: "#f0f5ff",
                color: "#1677ff",
                border: "1px solid #d6e4ff",
              }}
            >
              {s}×{s}
            </span>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#999",
            marginBottom: 12,
          }}
        >
          输出：ios/AppIcon.appiconset/（含 Contents.json）
        </div>

        {/* 路径选择 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleSelectIosPath}
            style={{ flexShrink: 0 }}
          >
            选择目录
          </Button>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: iosPath ? "#333" : "#bbb",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "32px",
            }}
          >
            {iosPath || "未选择输出目录"}
          </div>
        </div>

        <Button
          type="primary"
          icon={<AppleOutlined />}
          loading={isIconProcessing}
          disabled={!iosPath}
          onClick={handleExportIos}
          block
        >
          导出 iOS 图标
        </Button>

        {/* 成功后显示打开目录 */}
        {iconProcessResult && iconProcessResult.platform === "ios" && (
          <Button
            type="link"
            icon={<FolderOpenOutlined />}
            onClick={() => handleOpenDir(iconProcessResult.outputDir)}
            style={{ marginTop: 8, padding: 0 }}
          >
            打开输出目录
          </Button>
        )}
      </div>

      {/* Android Panel */}
      <div
        style={{
          flex: 1,
          minWidth: 280,
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e8e8e8",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <AndroidOutlined style={{ fontSize: 18 }} />
          Android 图标
        </div>

        {/* 密度列表 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {androidDensities.map((d) => (
            <span
              key={d.folder}
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
                background: "#f6ffed",
                color: "#52c41a",
                border: "1px solid #d9f7be",
              }}
            >
              {d.folder} ({d.size}px)
            </span>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#999",
            marginBottom: 12,
          }}
        >
          输出：android/mipmap-*/（含 ic_launcher.png）
        </div>

        {/* 路径选择 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleSelectAndroidPath}
            style={{ flexShrink: 0 }}
          >
            选择目录
          </Button>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: androidPath ? "#333" : "#bbb",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "32px",
            }}
          >
            {androidPath || "未选择输出目录"}
          </div>
        </div>

        <Button
          type="primary"
          icon={<AndroidOutlined />}
          loading={isIconProcessing}
          disabled={!androidPath}
          onClick={handleExportAndroid}
          block
          style={{ background: "#52c41a", borderColor: "#52c41a" }}
        >
          导出 Android 图标
        </Button>

        {/* 成功后显示打开目录 */}
        {iconProcessResult && iconProcessResult.platform === "android" && (
          <Button
            type="link"
            icon={<FolderOpenOutlined />}
            onClick={() => handleOpenDir(iconProcessResult.outputDir)}
            style={{ marginTop: 8, padding: 0 }}
          >
            打开输出目录
          </Button>
        )}
      </div>
    </div>
  );
};

export default IconExporter;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/icon/IconExporter.tsx
git commit -m "feat(icon): add IconExporter component with iOS and Android panels"
```

---

### Task 6: Create `IconPage` entry component

**Files:**
- Create: `src/pages/icon/index.tsx`

- [ ] **Step 1: Write the icon page entry**

Follows the same pattern as `ImagePage` — drop zone when unloaded, header + preview + operation panel when loaded.

```typescript
import React, { useCallback } from "react";
import { Button, Space, Typography, Spin, message } from "antd";
import {
  DeleteOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import { formatFileSize } from "../../utils/format";
import { getImageInfo } from "../../utils/image";
import IconDropZone from "./IconDropZone";
import IconExporter from "./IconExporter";

const { Text } = Typography;

const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg"];

const IconPage: React.FC = () => {
  const isIconLoaded = useAppStore((s) => s.isIconLoaded);
  const iconFileName = useAppStore((s) => s.iconFileName);
  const iconPath = useAppStore((s) => s.iconPath);
  const iconInfo = useAppStore((s) => s.iconInfo);
  const isIconProcessing = useAppStore((s) => s.isIconProcessing);
  const clearIcon = useAppStore((s) => s.clearIcon);
  const setIconFile = useAppStore((s) => s.setIconFile);

  const handleLoadImage = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片文件",
            extensions: ALLOWED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;

      const filePath = selected as string;
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        message.error(`不支持的格式: .${ext}，仅支持 PNG、JPG 格式`);
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "icon.png";
      const info = await getImageInfo(filePath);

      if (info.width !== info.height) {
        message.error("图片必须是正方形（宽高相等）");
        return;
      }
      if (info.width !== 512 && info.width !== 1024) {
        message.error("图片尺寸必须是 512×512 或 1024×1024");
        return;
      }

      setIconFile(filePath, fileName, {
        width: info.width,
        height: info.height,
        format: info.format,
        fileSize: info.fileSize,
      });
    } catch (err) {
      message.error(`加载失败: ${err}`);
    }
  }, [setIconFile]);

  if (!isIconLoaded) {
    return (
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <IconDropZone />
      </div>
    );
  }

  const src = convertFileSrc(iconPath);

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 960,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text strong ellipsis style={{ maxWidth: 600 }}>
            {iconFileName}
          </Text>
          {iconInfo && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {iconInfo.width}×{iconInfo.height} · {iconInfo.format.toUpperCase()} · {formatFileSize(iconInfo.fileSize)}
            </Text>
          )}
        </div>
        <Space>
          <Button icon={<FolderOpenOutlined />} onClick={handleLoadImage}>
            选择图片
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={clearIcon}>
            清空
          </Button>
        </Space>
      </div>

      {/* Image Preview */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "12px 0",
          marginBottom: 12,
          background: "#fafafa",
          borderRadius: 8,
        }}
      >
        <img
          src={src}
          alt="预览"
          style={{
            maxWidth: 200,
            maxHeight: 200,
            objectFit: "contain",
            borderRadius: 4,
          }}
        />
      </div>

      {/* Export Panel */}
      <Spin spinning={isIconProcessing} tip="导出中...">
        <IconExporter />
      </Spin>
    </div>
  );
};

export default IconPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/icon/index.tsx
git commit -m "feat(icon): add IconPage entry component"
```

---

### Task 7: Wire up the icon tab in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add icon tab and page**

Add the import:

```typescript
import IconPage from "./pages/icon";
```

Add `{ key: "icon", label: "图标" }` to the `items` array in the `<Tabs>` component, after the `"image"` entry.

Add `{activeTab === "icon" && <IconPage />}` after the image line in the content area.

Update the localStorage whitelist from `["video", "audio", "image"]` to `["video", "audio", "image", "icon"]`.

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat(icon): wire up icon tab in App.tsx"
```

---

### Task 8: Verify the build compiles

- [ ] **Step 1: Run type check**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any type errors if present**

If there are type errors, fix them and re-run `pnpm build`.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors in icon feature"
```
