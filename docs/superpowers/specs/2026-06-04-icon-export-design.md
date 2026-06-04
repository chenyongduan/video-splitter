# 图标导出功能设计

## 概述

在 MediaKit 应用中新增"图标"顶级 Tab，用户上传一张 1024×1024 或 512×512 的正方形图片后，可分别导出 iOS 和 Android 平台所需的全部 App 图标尺寸。

## 功能位置

- **顶级 Tab**："图标"，与视频、音频、图片同级
- **AppTab 类型**：新增 `"icon"` 值

## 页面布局

遵循现有页面模式（上传区 → 预览+信息 → 操作区 → 通知）：

1. **上传区**：拖拽或点击上传一张正方形图片（PNG/JPG/JPEG）
2. **图片预览**：上传后显示缩略图 + 文件信息（尺寸、格式、大小）
3. **操作区**：iOS 导出和 Android 导出各自独立的面板，各有输出路径选择和导出按钮
4. **进度通知**：复用现有 `ProcessNotification` 组件

## 上传校验

- 仅接受 PNG、JPG、JPEG 格式
- 上传后用 FFprobe 检测图片尺寸
- **必须为正方形**（宽 === 高）
- **尺寸限制**：仅接受 1024×1024 或 512×512
- 不符合条件时显示 Ant Design 错误提示（message.error）

## iOS 导出

### 输出目录结构

```
<用户选择的路径>/ios/
└── AppIcon.appiconset/
    ├── Contents.json
    ├── Icon-1024.png
    ├── Icon-512.png
    ├── Icon-256.png
    ├── Icon-128.png
    ├── Icon-64.png
    └── Icon-32.png
```

### 导出规则

| 尺寸 | 源图 1024 | 源图 512 |
|------|-----------|----------|
| 1024 | 直接复制 | 跳过（从 512 放大无意义） |
| 512  | 缩放     | 直接复制 |
| 256  | 缩放     | 缩放 |
| 128  | 缩放     | 缩放 |
| 64   | 缩放     | 缩放 |
| 32   | 缩放     | 缩放 |

- 源图为 512 时，不生成 1024 尺寸，`Contents.json` 中也排除该项
- 自动生成标准的 Xcode Asset Catalog 格式 `Contents.json`

### FFmpeg 命令

```bash
ffmpeg -i input.png -vf scale=512:512 Icon-512.png
```

## Android 导出

### 输出目录结构

```
<用户选择的路径>/android/
├── mipmap-mdpi/
│   └── ic_launcher.png      (48×48)
├── mipmap-hdpi/
│   └── ic_launcher.png      (72×72)
├── mipmap-xhdpi/
│   └── ic_launcher.png      (96×96)
├── mipmap-xxhdpi/
│   └── ic_launcher.png      (144×144)
└── mipmap-xxxhdpi/
    └── ic_launcher.png      (192×192)
```

### 导出规则

所有密度目录均从源图缩放生成，512 源图也能覆盖 Android 最大尺寸 192px。

### FFmpeg 命令

```bash
ffmpeg -i input.png -vf scale=192:192 ic_launcher.png
```

## 新增文件

| 文件 | 说明 |
|------|------|
| `src/pages/icon/index.tsx` | 图标页面入口（上传区、预览、信息展示） |
| `src/pages/icon/IconExporter.tsx` | iOS + Android 导出面板（各自独立的路径选择和导出按钮） |
| `src/utils/icon.ts` | FFmpeg 缩放命令封装、目录结构创建、Contents.json 生成 |

## 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 添加 "图标" Tab 项和 `<IconPage />` 渲染 |
| `src/types/index.ts` | 添加 `IconInfo`、`IconProcessResult` 等类型 |
| `src/store/segmentStore.ts` | 添加 icon 相关状态字段和 actions |

## 状态管理

遵循现有 Zustand store 模式，新增以下字段：

**状态**：
- `iconPath`、`iconFileName`、`iconInfo`（IconInfo | null）、`isIconLoaded`
- `iconFunctionTab`（预留，当前页面无需子标签）
- `iconProcessResult`（IconProcessResult | null）、`isIconProcessing`

**Actions**：
- `setIcon`：设置图标文件信息
- `clearIcon`：清除图标状态
- `setIconProcessing`：设置处理中状态
- `setIconProcessResult`：设置处理结果（触发通知）

## 类型定义

```typescript
interface IconInfo {
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

interface IconProcessResult {
  success: boolean;
  platform: 'ios' | 'android';
  outputDir: string;
  fileCount: number;
}
```
