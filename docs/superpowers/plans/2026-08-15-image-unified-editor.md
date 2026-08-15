# 图片处理统一编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图片页五个独立功能 Tab（转换/压缩/尺寸/裁剪/旋转）合并为一个统一编辑器：编辑操作实时预览、导出设置集中、一次 FFmpeg 完成全部操作。

**Architecture:** 新增纯函数 `resolveImageProcessParams` 把编辑状态 + 输出设置解析为一条 FFmpeg filter 链（旋转→翻转→裁剪→缩放）加输出质量参数；`processImage` 一次调用执行。五个旧面板删除，替换为 `ImageToolbar`（编辑操作）+ `OutputSettings`（导出设置）。裁剪坐标定义在旋转后的图上，与预览所见一致。

**Tech Stack:** Tauri v2 + React 19 + Ant Design 6 + Zustand 5，FFmpeg sidecar（`@tauri-apps/plugin-shell` 的 `Command.sidecar`）。

**Spec:** `docs/superpowers/specs/2026-08-15-image-unified-editor-design.md`

## Global Constraints

- 仓库未配置测试框架（无 test/lint 命令）。每个任务以 `pnpm build`（tsc 类型检查）通过为完成标准；手动功能验证集中在 Task 7。
- UI 文案全部为简体中文；组件写法沿用现有风格（antd + 内联 style 对象）。
- 包管理器用 pnpm。
- 每个任务结束时仓库必须能通过 `pnpm build`（旧组件在 Task 7 前保持可用，为此旧函数/旧类型延迟到 Task 7 删除）。
- 滤镜链顺序固定：`transpose/hflip/vflip → crop → scale`，质量参数按**输出**格式（jpg/webp/png）决定。

---

### Task 1: 新增类型定义

**Files:**
- Modify: `src/types/index.ts:107-146`（追加新类型，暂不删除旧类型）

**Interfaces:**
- Consumes: 无
- Produces（后续任务依赖的精确签名）:
  - `ImageCropRect { x: number; y: number; w: number; h: number }`
  - `ImageOutputFormat = "original" | "png" | "jpg" | "webp" | "bmp" | "ico" | "tiff" | "gif"`
  - `ImageOutputSettings { format: ImageOutputFormat; quality: number; sizeMode: "auto" | "percent" | "custom"; scalePercent: number; width: number; height: number; lockAspectRatio: boolean }`

- [ ] **Step 1: 在 `src/types/index.ts` 的 `ImageProcessResult` 之前追加以下类型（旧的 `ImageTaskType`、五个 Params 接口先保留，Task 7 删除）**

```ts
export interface ImageCropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ImageOutputFormat =
  | "original"
  | "png"
  | "jpg"
  | "webp"
  | "bmp"
  | "ico"
  | "tiff"
  | "gif";

export interface ImageOutputSettings {
  format: ImageOutputFormat;
  /** 1-100，仅 jpg/webp 生效 */
  quality: number;
  sizeMode: "auto" | "percent" | "custom";
  /** sizeMode === "percent" 时生效，1-1000（100 = 原尺寸） */
  scalePercent: number;
  /** sizeMode === "custom" 时生效 */
  width: number;
  height: number;
  lockAspectRatio: boolean;
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm build`
Expected: 通过（纯新增，无破坏）

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: 图片统一编辑器类型定义"
```

---

### Task 2: `utils/image.ts` 新增统一处理函数

**Files:**
- Modify: `src/utils/image.ts`（文件末尾追加；旧的五个函数暂不删除）

**Interfaces:**
- Consumes: `ImageInfo`、`ImageCropRect`、`ImageOutputSettings`（Task 1）
- Produces:
  - `interface ImageProcessParams { filters: string[]; qualityArgs: string[]; finalDimensions: { width: number; height: number }; format: string }`（从本文件导出）
  - `getEditedDimensions(imageInfo: ImageInfo, rotation: number, crop: ImageCropRect | null): { width: number; height: number }`
  - `resolveImageProcessParams(imageInfo: ImageInfo, edit: { rotation: number; flipH: boolean; flipV: boolean; crop: ImageCropRect | null }, output: ImageOutputSettings): ImageProcessParams`
  - `processImage(inputPath: string, outputPath: string, params: ImageProcessParams): Promise<void>`

- [ ] **Step 1: 在 `src/utils/image.ts` 顶部 import 中加入新类型**

```ts
import type {
  ImageInfo,
  ImageCropRect,
  ImageOutputSettings,
} from "../types";
```

（旧的五个 Params 类型 import 保留，Task 7 一起删。）

- [ ] **Step 2: 文件末尾追加以下代码**

```ts
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
      finalH = Math.max(1, Math.round((output.width / edited.width) * edited.height));
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

  return { filters, qualityArgs, finalDimensions: { width: finalW, height: finalH }, format };
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
```

- [ ] **Step 3: 类型检查**

Run: `pnpm build`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add src/utils/image.ts
git commit -m "feat: 图片统一处理函数 processImage 与参数解析"
```

---

### Task 3: Store 增加统一编辑状态

**Files:**
- Modify: `src/store/segmentStore.ts`（图片 state/actions 部分，约 56-67、99-108、190-201、333-365 行区域）

**Interfaces:**
- Consumes: `ImageOutputSettings`（Task 1）
- Produces（后续任务依赖的精确签名）:
  - state: `imageCropEnabled: boolean`、`imageOutput: ImageOutputSettings`
  - actions: `setImageCropEnabled(val: boolean): void`、`setImageOutput(patch: Partial<ImageOutputSettings>): void`、`resetImageEdit(): void`
  - 默认值常量 `DEFAULT_IMAGE_OUTPUT: ImageOutputSettings`（从本文件导出，供重置使用）
  - 保留不动：`imageRotation / imageFlipH / imageFlipV / imageCropRect` 及其 setter、`imageProcessResult`、`isImageProcessing`

- [ ] **Step 1: import 类型**

在 `segmentStore.ts` 顶部的类型 import 中加入 `ImageOutputSettings`。

- [ ] **Step 2: 在 store state 类型区（`imageCropRect` 声明之后）追加**

```ts
imageCropEnabled: boolean;
imageOutput: ImageOutputSettings;
```

在 actions 类型区（`setImageCropRect` 之后）追加：

```ts
setImageCropEnabled: (val: boolean) => void;
setImageOutput: (patch: Partial<ImageOutputSettings>) => void;
resetImageEdit: () => void;
```

- [ ] **Step 3: 在实现区顶部（state 默认值之前）定义默认值**

```ts
const DEFAULT_IMAGE_OUTPUT: ImageOutputSettings = {
  format: "original",
  quality: 80,
  sizeMode: "auto",
  scalePercent: 100,
  width: 0,
  height: 0,
  lockAspectRatio: true,
};

/** 重置图片编辑状态（旋转/翻转/裁剪/裁剪开关），不清理文件信息 */
const resetImageEditState = () => ({
  imageRotation: 0,
  imageFlipH: false,
  imageFlipV: false,
  imageCropRect: { x: 0, y: 0, w: 0, h: 0 },
  imageCropEnabled: false,
  imageOutput: { ...DEFAULT_IMAGE_OUTPUT },
});
```

- [ ] **Step 4: 修改默认 state 与 actions 实现**

默认 state 中 `imageCropRect` 之后追加：

```ts
imageCropEnabled: false,
imageOutput: { ...DEFAULT_IMAGE_OUTPUT },
```

`setImageFile` 改为加载新图时重置全部编辑状态（在 set 对象中加入 `...resetImageEditState()`）；`clearImage` 同样加入 `...resetImageEditState()`。在 `setImageCropRect` 实现之后追加：

```ts
setImageCropEnabled: (val) => set({ imageCropEnabled: val }),
setImageOutput: (patch) =>
  set((s) => ({ imageOutput: { ...s.imageOutput, ...patch } })),
resetImageEdit: () => set({ ...resetImageEditState() }),
```

注意：`imageFunctionTab` / `setImageFunctionTab` 本任务**保留**（`index.tsx` 还在用，Task 7 删除）。

- [ ] **Step 5: 类型检查**

Run: `pnpm build`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add src/store/segmentStore.ts
git commit -m "feat: store 增加图片统一编辑状态"
```

---

### Task 4: ImagePreview 常驻 transform + 旋转坐标系裁剪

**Files:**
- Modify: `src/pages/image/ImagePreview.tsx`

**Interfaces:**
- Consumes: `imageCropEnabled`（Task 3 store）、`getEditedDimensions`（Task 2）
- Produces: `ImagePreview` 组件（默认导出，无 props），行为变化——旋转/翻转 transform 常驻生效；`imageCropEnabled === true` 时显示裁剪遮罩

- [ ] **Step 1: 修改 `CropOverlay`——坐标映射改用"旋转后基准尺寸"**

import 处加入：

```ts
import { getEditedDimensions } from "../../utils/image";
```

`CropOverlay` 内（取 `imageInfo` 的 hook 之后）加入：

```ts
const rotation = useAppStore((s) => s.imageRotation);
// 旋转后的基准尺寸（不含裁剪）：90/270 时宽高互换
const base =
  imageInfo && rotation !== undefined
    ? getEditedDimensions(imageInfo, rotation, null)
    : null;
```

然后做以下替换（`CropOverlay` 内所有对 `imageInfo.width` / `imageInfo.height` 的引用）：

- **删除初始化 useEffect**（第 34-39 行，初始化职责移交给 ImageToolbar 的裁剪开关）
- `imgToPx` 中 `imageInfo?.width` → `base?.width`、`imageInfo?.height` → `base?.height`（依赖数组中 `imageInfo` 改为 `base`）
- `handleMouseMove` 中 `imageInfo.width / d.width` → `base.width / d.width`、`imageInfo.height / d.height` → `base.height / d.height`；约束用的 `imageInfo.width` / `imageInfo.height` 全部改为 `base.width` / `base.height`；开头的 `if (!drag || !imageInfo) return;` 改为 `if (!drag || !base) return;`（依赖数组同步调整）
- 渲染守卫 `if (!imageInfo || cropRect.w === 0) return null;` 改为 `if (!base || cropRect.w === 0) return null;`

- [ ] **Step 2: 修改 `ImagePreview` 主组件——transform 常驻、裁剪由开关控制**

- 删除 `imageFunctionTab` 的读取
- 加入 `const imageCropEnabled = useAppStore((s) => s.imageCropEnabled);`
- `showTransform` 相关逻辑删除：`transforms` 数组无条件构建（`imageRotation !== 0` 时 push rotate、flipH/V 时 unshift scaleX/scaleY），`transform` 有值就用
- `const absRotation = ...` 不再依赖 `showTransform`，直接 `const absRotation = ((imageRotation % 360) + 360) % 360;`
- `const showCrop = imageCropEnabled;`
- `transition` 改为恒定 `"transform 0.2s ease"`

- [ ] **Step 3: 类型检查**

Run: `pnpm build`
Expected: 通过（此时功能上 Tab 还在，但预览已常驻显示旋转/翻转——中间态可接受，Task 7 收口）

- [ ] **Step 4: Commit**

```bash
git add src/pages/image/ImagePreview.tsx
git commit -m "feat: 图片预览常驻 transform 与旋转坐标系裁剪"
```

---

### Task 5: 新建 ImageToolbar 编辑工具栏

**Files:**
- Create: `src/pages/image/ImageToolbar.tsx`

**Interfaces:**
- Consumes: store 的 `imageRotation / imageFlipH / imageFlipV / imageCropRect / imageCropEnabled` 及 setter、`resetImageEdit`（Task 3）；`getEditedDimensions`（Task 2）
- Produces: `ImageToolbar` 组件（默认导出，无 props）——旋转/翻转/裁剪开关/数值输入/重置；开启裁剪时负责把 `imageCropRect` 初始化为旋转后的完整尺寸；旋转变化时若裁剪已启用则重置裁剪框

- [ ] **Step 1: 创建 `src/pages/image/ImageToolbar.tsx`**

```tsx
import React, { useEffect } from "react";
import { Button, InputNumber, Space, Typography } from "antd";
import {
  RotateLeftOutlined,
  RotateRightOutlined,
  FlipOutlined,
  ScissorOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { useAppStore } from "../../store/segmentStore";
import { getEditedDimensions } from "../../utils/image";

const { Text } = Typography;

/**
 * 编辑工具栏：旋转 / 翻转 / 裁剪开关（含数值输入）/ 重置。
 * 所有操作实时反映在预览区，导出时一次性应用。
 */
const ImageToolbar: React.FC = () => {
  const imageInfo = useAppStore((s) => s.imageInfo);
  const rotation = useAppStore((s) => s.imageRotation);
  const flipH = useAppStore((s) => s.imageFlipH);
  const flipV = useAppStore((s) => s.imageFlipV);
  const cropRect = useAppStore((s) => s.imageCropRect);
  const cropEnabled = useAppStore((s) => s.imageCropEnabled);
  const setRotation = useAppStore((s) => s.setImageRotation);
  const setFlipH = useAppStore((s) => s.setImageFlipH);
  const setFlipV = useAppStore((s) => s.setImageFlipV);
  const setCropRect = useAppStore((s) => s.setImageCropRect);
  const setCropEnabled = useAppStore((s) => s.setImageCropEnabled);
  const resetImageEdit = useAppStore((s) => s.resetImageEdit);

  // 旋转后的基准尺寸（不含裁剪）
  const base = imageInfo ? getEditedDimensions(imageInfo, rotation, null) : null;

  // 旋转变化导致基准尺寸改变时，已启用的裁剪框可能越界 → 重置为完整尺寸
  useEffect(() => {
    if (cropEnabled && base) {
      setCropRect({ x: 0, y: 0, w: base.width, h: base.height });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, cropEnabled]);

  const handleToggleCrop = () => {
    if (!imageInfo || !base) return;
    if (!cropEnabled) {
      // 开启裁剪：初始化为旋转后的完整尺寸（若尚未有裁剪框）
      if (cropRect.w === 0 || cropRect.h === 0) {
        setCropRect({ x: 0, y: 0, w: base.width, h: base.height });
      }
      setCropEnabled(true);
    } else {
      setCropEnabled(false);
    }
  };

  const iconBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    background: active ? "#1677ff" : "#f5f5f5",
    border: `1px solid ${active ? "#1677ff" : "#e8e8e8"}`,
    fontSize: 16,
    color: active ? "#fff" : "#555",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          title="向左旋转 90°"
          onClick={() => setRotation(rotation - 90)}
          style={iconBtnStyle(false)}
        >
          <RotateLeftOutlined />
        </div>
        <div
          title="向右旋转 90°"
          onClick={() => setRotation(rotation + 90)}
          style={iconBtnStyle(false)}
        >
          <RotateRightOutlined />
        </div>
        <div
          title="水平翻转"
          onClick={() => setFlipH(!flipH)}
          style={iconBtnStyle(flipH)}
        >
          <FlipOutlined />
        </div>
        <div
          title="垂直翻转"
          onClick={() => setFlipV(!flipV)}
          style={iconBtnStyle(flipV)}
        >
          <FlipOutlined style={{ transform: "rotate(90deg)" }} />
        </div>

        <div style={{ width: 1, height: 24, background: "#e8e8e8" }} />

        <Button
          icon={<ScissorOutlined />}
          type={cropEnabled ? "primary" : "default"}
          onClick={handleToggleCrop}
        >
          裁剪
        </Button>

        <div style={{ flex: 1 }} />

        <Button icon={<UndoOutlined />} onClick={resetImageEdit}>
          重置编辑
        </Button>
      </div>

      {/* 裁剪数值输入 */}
      {cropEnabled && base && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            paddingTop: 8,
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>X：</Text>
            <InputNumber
              min={0}
              max={base.width - 1}
              value={cropRect.x}
              onChange={(v) => {
                const newX = v ?? 0;
                setCropRect({
                  ...cropRect,
                  x: newX,
                  w: Math.min(cropRect.w, base.width - newX),
                });
              }}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>Y：</Text>
            <InputNumber
              min={0}
              max={base.height - 1}
              value={cropRect.y}
              onChange={(v) => {
                const newY = v ?? 0;
                setCropRect({
                  ...cropRect,
                  y: newY,
                  h: Math.min(cropRect.h, base.height - newY),
                });
              }}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>宽度：</Text>
            <InputNumber
              min={1}
              max={base.width - cropRect.x}
              value={cropRect.w}
              onChange={(v) => setCropRect({ ...cropRect, w: v ?? 0 })}
              style={{ width: 80 }}
            />
          </Space>
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>高度：</Text>
            <InputNumber
              min={1}
              max={base.height - cropRect.y}
              value={cropRect.h}
              onChange={(v) => setCropRect({ ...cropRect, h: v ?? 0 })}
              style={{ width: 80 }}
            />
          </Space>
          <Button
            size="small"
            onClick={() => setCropRect({ x: 0, y: 0, w: base.width, h: base.height })}
          >
            全图
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageToolbar;
```

- [ ] **Step 2: 类型检查**

Run: `pnpm build`
Expected: 通过（组件暂未被引用）

- [ ] **Step 3: Commit**

```bash
git add src/pages/image/ImageToolbar.tsx
git commit -m "feat: 图片编辑工具栏组件"
```

---

### Task 6: 新建 OutputSettings 导出设置面板

**Files:**
- Create: `src/pages/image/OutputSettings.tsx`

**Interfaces:**
- Consumes: store 的 `imagePath / imageInfo / imageRotation / imageFlipH / imageFlipV / imageCropRect / imageOutput / setImageOutput / setImageProcessing / setImageProcessResult`；`getEditedDimensions / resolveImageProcessParams / processImage / getImageInfo`（Task 2）
- Produces: `OutputSettings` 组件（默认导出，无 props）——尺寸/格式/质量设置 + 导出按钮（保存对话框 → processImage → 结果通知数据）

- [ ] **Step 1: 创建 `src/pages/image/OutputSettings.tsx`**

```tsx
import React, { useMemo, useState } from "react";
import {
  Button,
  InputNumber,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  Typography,
  message,
} from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import {
  getEditedDimensions,
  getImageInfo,
  processImage,
  resolveImageProcessParams,
} from "../../utils/image";
import type { ImageOutputFormat } from "../../types";

const { Text } = Typography;

const FORMAT_OPTIONS: { value: ImageOutputFormat; label: string }[] = [
  { value: "original", label: "保持原格式" },
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "bmp", label: "BMP" },
  { value: "ico", label: "ICO" },
  { value: "tiff", label: "TIFF" },
  { value: "gif", label: "GIF" },
];

/**
 * 导出设置：尺寸 / 格式 / 质量 + 导出按钮。
 * 编辑状态（旋转/翻转/裁剪）来自 store，一次 FFmpeg 完成全部操作。
 */
const OutputSettings: React.FC = () => {
  const imagePath = useAppStore((s) => s.imagePath);
  const imageInfo = useAppStore((s) => s.imageInfo);
  const rotation = useAppStore((s) => s.imageRotation);
  const flipH = useAppStore((s) => s.imageFlipH);
  const flipV = useAppStore((s) => s.imageFlipV);
  const cropRect = useAppStore((s) => s.imageCropRect);
  const output = useAppStore((s) => s.imageOutput);
  const setOutput = useAppStore((s) => s.setImageOutput);
  const setProcessing = useAppStore((s) => s.setImageProcessing);
  const setProcessResult = useAppStore((s) => s.setImageProcessResult);

  const [loading, setLoading] = useState(false);

  // 编辑后（旋转+裁剪）尺寸
  const edited = useMemo(
    () => (imageInfo ? getEditedDimensions(imageInfo, rotation, cropRect) : null),
    [imageInfo, rotation, cropRect]
  );

  const resolvedFormat =
    output.format === "original" ? imageInfo?.format : output.format;
  const showQuality = resolvedFormat === "jpg" || resolvedFormat === "webp";
  const isPng = resolvedFormat === "png";

  const handleWidthChange = (val: number | null) => {
    if (val === null || !edited) return;
    if (output.lockAspectRatio && edited.width > 0) {
      const h = Math.max(1, Math.round((val / edited.width) * edited.height));
      setOutput({ width: val, height: h });
    } else {
      setOutput({ width: val });
    }
  };

  const handleHeightChange = (val: number | null) => {
    if (val === null || !edited) return;
    if (output.lockAspectRatio && edited.height > 0) {
      const w = Math.max(1, Math.round((val / edited.height) * edited.width));
      setOutput({ width: w, height: val });
    } else {
      setOutput({ height: val });
    }
  };

  const handleExport = async () => {
    if (!imagePath || !imageInfo || !edited) return;

    // 校验
    if (output.sizeMode === "custom") {
      if (output.lockAspectRatio && output.width <= 0) {
        message.warning("请输入有效的宽度");
        return;
      }
      if (!output.lockAspectRatio && (output.width <= 0 || output.height <= 0)) {
        message.warning("请输入有效的宽度和高度");
        return;
      }
    }
    if (output.sizeMode === "percent" && output.scalePercent <= 0) {
      message.warning("请输入有效的缩放百分比");
      return;
    }

    try {
      const baseName =
        imagePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") || "image";
      const ext = resolvedFormat || "png";

      const outputPath = await save({
        defaultPath: `${baseName}_edited.${ext}`,
        filters: [{ name: "图片文件", extensions: [ext] }],
      });
      if (!outputPath) return;

      setLoading(true);
      setProcessing(true);

      const params = resolveImageProcessParams(
        imageInfo,
        { rotation, flipH, flipV, crop: cropRect },
        output
      );
      await processImage(imagePath, outputPath, params);

      const outputInfo = await getImageInfo(outputPath);

      setProcessResult({
        inputPath: imagePath,
        outputPath,
        inputFormat: imageInfo.format,
        outputFormat: params.format,
        inputSize: imageInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputDimensions: `${imageInfo.width}×${imageInfo.height}`,
        outputDimensions: `${outputInfo.width}×${outputInfo.height}`,
        taskType: "export",
      });

      message.success("导出完成");
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setLoading(false);
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 尺寸 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>输出尺寸：</Text>
        <Segmented
          value={output.sizeMode}
          onChange={(v) => setOutput({ sizeMode: v as typeof output.sizeMode })}
          options={[
            { value: "auto", label: "跟随编辑" },
            { value: "percent", label: "按百分比" },
            { value: "custom", label: "自定义" },
          ]}
        />
        {edited && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            编辑后 {edited.width}×{edited.height}
          </Text>
        )}
        {output.sizeMode === "percent" && (
          <Space>
            <Text style={{ fontSize: 13, color: "#666" }}>百分比：</Text>
            <InputNumber
              min={1}
              max={1000}
              value={output.scalePercent}
              onChange={(v) => setOutput({ scalePercent: v ?? 100 })}
              style={{ width: 90 }}
              addonAfter="%"
            />
          </Space>
        )}
        {output.sizeMode === "custom" && (
          <>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>宽度：</Text>
              <InputNumber
                min={1}
                max={10000}
                value={output.width}
                onChange={handleWidthChange}
                style={{ width: 100 }}
              />
            </Space>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>高度：</Text>
              <InputNumber
                min={1}
                max={10000}
                value={output.height}
                onChange={handleHeightChange}
                style={{ width: 100 }}
              />
            </Space>
            <Space>
              <Text style={{ fontSize: 13, color: "#666" }}>锁定比例</Text>
              <Switch
                checked={output.lockAspectRatio}
                onChange={(v) => setOutput({ lockAspectRatio: v })}
              />
            </Space>
          </>
        )}
      </div>

      {/* 格式 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>输出格式：</Text>
        <Select
          value={output.format}
          onChange={(v) => setOutput({ format: v })}
          style={{ width: 140 }}
          options={FORMAT_OPTIONS}
        />
        {isPng && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            PNG 无损，将使用最大压缩力度
          </Text>
        )}
      </div>

      {/* 质量（仅有损格式显示） */}
      {showQuality && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Text style={{ fontSize: 13, color: "#666", minWidth: 60 }}>
            压缩质量：
          </Text>
          <Slider
            min={1}
            max={100}
            value={output.quality}
            onChange={(v) => setOutput({ quality: v })}
            style={{ flex: 1 }}
          />
          <Text strong style={{ minWidth: 40, textAlign: "right" }}>
            {output.quality}%
          </Text>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 8,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <Button
          type="primary"
          icon={<ExportOutlined />}
          loading={loading}
          onClick={handleExport}
        >
          导出
        </Button>
      </div>
    </div>
  );
};

export default OutputSettings;
```

- [ ] **Step 2: 类型检查**

Run: `pnpm build`
Expected: 通过。若 `taskType: "export"` 报类型错误，是因为 `ImageTaskType` 还没更新——此时先在 `src/types/index.ts` 把 `ImageTaskType` 的定义改为 `"export" | "convert" | "compress" | "resize" | "crop" | "rotate"`（临时兼容旧面板的五个值），Task 7 再收敛为 `"export"`。

- [ ] **Step 3: Commit**

```bash
git add src/pages/image/OutputSettings.tsx src/types/index.ts
git commit -m "feat: 图片导出设置面板组件"
```

---

### Task 7: 重写页面布局、删除旧面板与旧代码

**Files:**
- Modify: `src/pages/image/index.tsx`（重写）
- Delete: `src/pages/image/ImageConverter.tsx`、`ImageCompressor.tsx`、`ImageResizer.tsx`、`ImageCropper.tsx`、`ImageRotator.tsx`
- Modify: `src/utils/image.ts`（删除五个旧函数）
- Modify: `src/types/index.ts`（删除旧 Params 类型，收敛 ImageTaskType）
- Modify: `src/store/segmentStore.ts`（删除 imageFunctionTab）

**Interfaces:**
- Consumes: `ImageToolbar`（Task 5）、`OutputSettings`（Task 6）、`ImagePreview`（Task 4）、`ImageMetadata`、`ImageDropZone`、`ProcessNotification`
- Produces: 完整的统一编辑器页面

- [ ] **Step 1: 重写 `src/pages/image/index.tsx`**

整体结构保留（未加载时 DropZone、头部按钮、ProcessNotification），去掉功能 Tab 区，替换功能面板为工具栏 + 导出设置。完整代码：

```tsx
import React, { useCallback } from "react";
import { Button, Space, Typography, Spin, message } from "antd";
import { DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import { formatFileSize } from "../../utils/format";
import { getImageInfo } from "../../utils/image";
import ProcessNotification from "../../components/ProcessNotification";
import ImageDropZone from "./ImageDropZone";
import ImageMetadata from "./ImageMetadata";
import ImagePreview from "./ImagePreview";
import ImageToolbar from "./ImageToolbar";
import OutputSettings from "./OutputSettings";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "ico",
  "tiff",
  "gif",
];

const ImagePage: React.FC = () => {
  const isImageLoaded = useAppStore((s) => s.isImageLoaded);
  const imageFileName = useAppStore((s) => s.imageFileName);
  const imageProcessResult = useAppStore((s) => s.imageProcessResult);
  const isImageProcessing = useAppStore((s) => s.isImageProcessing);
  const clearImage = useAppStore((s) => s.clearImage);
  const setImageFile = useAppStore((s) => s.setImageFile);
  const setImageProcessResult = useAppStore((s) => s.setImageProcessResult);

  const handleLoadImage = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "图片文件",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileName = filePath.split(/[/\\]/).pop() || "image.png";
      const info = await getImageInfo(filePath);
      setImageFile(filePath, fileName, info);
    } catch (err) {
      message.error(`加载失败: ${err}`);
    }
  }, [setImageFile]);

  if (!isImageLoaded) {
    return (
      <div
        style={{
          padding: 16,
          maxWidth: 960,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <ImageDropZone />
      </div>
    );
  }

  return (
    <>
      <ProcessNotification
        result={imageProcessResult}
        extraLines={
          imageProcessResult ? (
            <>
              <div>
                尺寸：{imageProcessResult.inputDimensions} →{" "}
                {imageProcessResult.outputDimensions}
              </div>
              <div>
                文件大小：{formatFileSize(imageProcessResult.inputSize)} →{" "}
                {formatFileSize(imageProcessResult.outputSize)}
              </div>
            </>
          ) : undefined
        }
        onDone={() => setImageProcessResult(null)}
      />
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
              {imageFileName}
            </Text>
          </div>
          <Space>
            <Button icon={<FolderOpenOutlined />} onClick={handleLoadImage}>
              选择图片
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={clearImage}>
              清空
            </Button>
          </Space>
        </div>

        {/* Metadata */}
        <ImageMetadata />

        {/* Image Preview（编辑实时预览） */}
        <ImagePreview />

        {/* 编辑工具栏 */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e8e8e8",
            padding: 16,
            marginBottom: 12,
          }}
        >
          <ImageToolbar />
        </div>

        {/* 导出设置 */}
        <Spin spinning={isImageProcessing} tip="处理中...">
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #e8e8e8",
              padding: 16,
            }}
          >
            <OutputSettings />
          </div>
        </Spin>
      </div>
    </>
  );
};

export default ImagePage;
```

- [ ] **Step 2: 删除五个旧面板**

```bash
rm src/pages/image/ImageConverter.tsx src/pages/image/ImageCompressor.tsx src/pages/image/ImageResizer.tsx src/pages/image/ImageCropper.tsx src/pages/image/ImageRotator.tsx
```

- [ ] **Step 3: `src/utils/image.ts` 删除旧函数与旧 import**

删除 `convertImage`、`compressImage`、`resizeImage`、`cropImage`、`rotateImage` 五个函数；顶部 import 中删除 `ImageConvertParams`、`ImageCompressParams`、`ImageResizeParams`、`ImageCropParams`、`ImageRotateParams`。保留 `getImageInfo` 与 Task 2 新增的内容。

- [ ] **Step 4: `src/types/index.ts` 清理**

- `ImageTaskType` 收敛为 `export type ImageTaskType = "export";`
- 删除 `ImageConvertParams`、`ImageCompressParams`、`ImageResizeParams`、`ImageCropParams`、`ImageRotateParams` 五个接口（`ImageCropRect`、`ImageOutputFormat`、`ImageOutputSettings` 保留）

- [ ] **Step 5: `src/store/segmentStore.ts` 清理**

删除 state `imageFunctionTab`、action `setImageFunctionTab` 及其默认值/实现中的对应项。

- [ ] **Step 6: 全局引用检查**

Run: `grep -rn "imageFunctionTab\|ImageConverter\|ImageCompressor\|ImageResizer\|ImageCropper\|ImageRotator\|convertImage\|compressImage\|resizeImage\|cropImage\|rotateImage" src/`
Expected: 无输出（确认无残留引用）

- [ ] **Step 7: 类型检查**

Run: `pnpm build`
Expected: 通过

- [ ] **Step 8: 手动验证（`pnpm tauri dev`）**

按 spec 的验证清单逐项确认：

1. 单操作：仅转格式、仅压缩（jpg/webp 质量滑块）、仅裁剪（拖拽 + 数值输入）、仅旋转/翻转、仅缩放（百分比/自定义/锁定比例）
2. 组合操作：裁剪 + 旋转 + 转 WebP + 质量压缩一次导出，输出正确
3. 旋转 90° 后再裁剪：裁剪框所见即所得（坐标在旋转后的图上）
4. 边界：ICO 目标格式超 256 自动缩小；PNG 不显示质量滑块但显示无损提示；导出对话框取消不报错
5. 结果通知显示前后尺寸/大小对比；"打开文件所在目录"可用
6. 重置编辑、切换新图片后编辑状态清空

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 图片页合并为统一编辑器"
```

---

## Self-Review 结果

- **Spec 覆盖**：布局（Task 7）、filter 链合成与 ICO/质量规则（Task 2）、store 状态（Task 3）、预览与裁剪坐标系（Task 4）、工具栏（Task 5）、导出面板（Task 6）、删除旧组件（Task 7）、验证清单（Task 7 Step 8）——全部有对应任务
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码
- **类型一致性**：`ImageCropRect`/`ImageOutputSettings`（Task 1）→ `getEditedDimensions`/`resolveImageProcessParams`/`processImage`（Task 2）→ store actions（Task 3）→ 组件消费（Task 4/5/6），签名一致；`taskType: "export"` 的临时兼容方案在 Task 6 Step 2 中显式说明
