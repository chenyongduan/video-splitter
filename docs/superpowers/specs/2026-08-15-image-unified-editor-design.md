# 图片处理统一编辑器设计

日期：2026-08-15

## 背景与问题

图片页当前有五个独立功能 Tab（格式转换、压缩、尺寸调整、裁剪、旋转翻转），每个 Tab 都是一次性操作：各自弹保存对话框、各自从**原始图片**跑一次 FFmpeg。操作之间无法组合——例如"裁剪后再压缩"或"转成 WebP 同时缩小尺寸"这类常见需求无法一次完成，用户只能手动用输出文件重新走一遍流程。

底层本就适合合并：FFmpeg 的 `crop`、`scale`、`transpose`、`hflip/vflip` 是一条 filter 链，格式与质量是输出编码参数，全部操作可由一次 FFmpeg 调用完成。

## 目标

将五个功能 Tab 合并为一个"统一编辑器"交互模型：

- 编辑操作（旋转/翻转/裁剪）在预览区实时所见即所得
- 输出设置（尺寸/格式/质量）集中在一个面板
- 一个导出按钮、一次保存对话框、一次 FFmpeg 调用完成全部操作

非目标：批量处理多张图片（维持单图）；新增滤镜/水印等编辑能力。

## 整体布局（自上而下）

1. **头部**：文件名 + 选择图片 / 清空（保留现状）
2. **元信息**：`ImageMetadata`（保留现状）
3. **预览区**：始终显示当前编辑状态——旋转/翻转实时应用 transform，裁剪模式下显示拖拽裁剪框
4. **编辑工具栏**：左转 90°、右转 90°、水平翻转、垂直翻转、裁剪开关（开启后显示拖拽框 + X/Y/W/H 数值输入）、重置全部
5. **导出设置面板**：
   - **尺寸**：默认跟随编辑后尺寸；支持按百分比缩放或自定义宽/高（可锁定比例）
   - **格式**：保持原格式 / png / jpg / webp / bmp / ico / tiff / gif
   - **质量**：滑块 1–100，仅 jpg/webp 显示（png 维持现有 compression_level 9 + pred mixed 策略）
   - **导出按钮**：保存对话框 → 一次 FFmpeg → 完成通知

## FFmpeg 命令合成

`utils/image.ts` 中五个独立函数（`convertImage` / `compressImage` / `resizeImage` / `cropImage` / `rotateImage`）合并为一个：

```ts
processImage(inputPath: string, outputPath: string, params: ImageProcessParams): Promise<void>
```

按固定顺序合成一条 filter 链：

```
旋转/翻转（transpose / hflip / vflip） → 裁剪（crop） → 缩放（scale）
```

输出编码参数由目标格式决定：

- jpg：`-q:v`（2 最优 → 31 最差，由 1–100 质量值反算，沿用现有公式）
- webp：`-q:v 0–100`
- png：`-compression_level 9 -pred mixed`
- 其他格式：无质量参数

**裁剪坐标定义在"旋转后的图"上**，与预览所见一致，链序天然正确（先旋转后裁剪）。

**ICO 边界**：目标格式为 ico 时，若最终尺寸超过 256×256，在链尾追加 scale 限制到 256 以内（沿用现有逻辑，作用于裁剪/缩放之后）。

缩放规则：

- 百分比模式：`scale=iw*P/100:ih*P/100`
- 自定义宽高 + 锁定比例：`scale=W:-1`（按宽）或 `scale=-1:H`（按高，以用户最后修改的维度为准）
- 自定义宽高 + 自由：`scale=W:H`
- 跟随编辑后尺寸：不加 scale

**无任何 filter 时不传 `-vf`**（如仅转格式 + 质量）。

## 编辑状态与 Store 变化

删除 `imageFunctionTab` 及五个面板各自的临时状态，替换为统一编辑状态：

```ts
// 编辑操作（作用于原图，实时预览）
imageRotation: number;        // 0 | 90 | 180 | 270
imageFlipH: boolean;
imageFlipV: boolean;
imageCropRect: { x; y; w; h }; // 旋转后坐标系；w/h 为 0 表示未裁剪（全图）

// 导出设置
imageOutput: {
  format: "original" | "png" | "jpg" | "webp" | "bmp" | "ico" | "tiff" | "gif";
  quality: number;             // 1–100，仅 jpg/webp 生效
  sizeMode: "auto" | "percent" | "custom";
  scalePercent: number;        // sizeMode = percent
  width?: number; height?: number; lockAspectRatio: boolean; // sizeMode = custom
}
```

加载新图片 / 清空时全部重置。`imageProcessResult`、`isImageProcessing` 保留，完成通知照旧显示前后尺寸/文件大小对比。

## 组件变化

| 操作 | 文件 | 说明 |
|------|------|------|
| 重写 | `pages/image/index.tsx` | 新布局，去掉功能 Tab |
| 增强 | `pages/image/ImagePreview.tsx` | transform 常驻生效（不再依赖 rotate Tab）；裁剪模式由开关控制；CropOverlay 坐标基于旋转后的显示图 |
| 新建 | `pages/image/ImageToolbar.tsx` | 旋转/翻转/裁剪开关/重置控件 + 裁剪数值输入 |
| 新建 | `pages/image/OutputSettings.tsx` | 尺寸/格式/质量 + 导出按钮 + 保存对话框 |
| 删除 | `ImageConverter / ImageCompressor / ImageResizer / ImageCropper / ImageRotator` | 功能并入统一编辑器 |
| 重写 | `utils/image.ts` | 合并为 `processImage`；`getImageInfo` 不变；删除五个旧函数 |
| 精简 | `store/segmentStore.ts` | 图片部分按上述状态重写 |

`types/index.ts` 中五个操作参数类型合并为 `ImageProcessParams`；`ImageProcessResult` 保留。

## 预览细节

- 旋转/翻转用 CSS `transform` 实时呈现（沿用现有实现，去掉 Tab 条件）
- 裁剪模式下 `CropOverlay`（现有拖拽遮罩，八方向手柄 + 三分线）直接复用；旋转 90°/270° 时显示尺寸约束交换（现有逻辑已有）
- 裁剪矩形与旋转坐标系一致：预览显示的即为旋转后的图，拖拽得到的坐标直接作为 crop 参数（链中 crop 在 transpose 之后）

## 错误处理

- FFmpeg 非零退出码抛错，`message.error` 提示（沿用现状）
- 导出前校验：裁剪区域超界 / 尺寸非法时阻止并提示
- 质量滑块仅对有损格式显示，切换格式时隐藏而非禁用，避免无效操作

## 验证方式

仓库未配置测试框架，按项目现状：

1. `pnpm build` 通过类型检查
2. `pnpm tauri dev` 手动验证：
   - 单操作：仅转格式、仅压缩、仅裁剪、仅旋转、仅缩放
   - 组合操作：裁剪 + 旋转 + 转 WebP + 压缩一次导出
   - 边界：ICO 超 256 缩小、png 无质量滑块、导出取消（不弹报错）
   - 结果通知的前后尺寸/大小对比正确
