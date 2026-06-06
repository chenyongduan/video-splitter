# 导出音频功能设计

## 概述

在视频处理页面新增「导出音频」Tab，允许用户从已加载的视频文件中提取音频轨道并导出为 MP3 文件。使用 FFmpeg 默认 MP3 编码参数（`-q:a 2` VBR ≈190kbps），无需用户配置音质选项。

## 需求

- 仅支持导出为 MP3 格式
- 使用 FFmpeg 默认编码参数，无需音质配置
- 作为视频页面独立 Tab 呈现
- 复用现有的处理通知（ProcessNotification）和错误处理机制

## 变更清单

### 1. 类型扩展 — `src/types/index.ts`

- `VideoFunctionTab` 联合类型新增 `"extractAudio"`
- `VideoTaskType` 联合类型新增 `"extractAudio"`

### 2. FFmpeg 工具函数 — `src/utils/ffmpeg.ts`

新增 `extractAudio(inputPath: string, outputPath: string): Promise<void>`：

```
ffmpeg -y -i <input> -c:a libmp3lame -q:a 2 <output.mp3>
```

- `-q:a 2` — LAME VBR 模式，约 190kbps，音质优良
- 错误时抛出含 stderr 的异常

### 3. 新组件 — `src/pages/video/VideoExtractAudio.tsx`

界面风格与 `VideoConverter` 保持一致：

- 一个「导出音频」按钮（`AudioOutlined` 图标）
- 点击流程：
  1. 弹出保存对话框（`@tauri-apps/plugin-dialog` 的 `save()`），默认文件名取视频名 + `_audio.mp3`
  2. 调用 `extractAudio()` 执行提取
  3. 成功后用 `getVideoFileInfo()` 获取输出文件信息（文件大小）
  4. 构造 `VideoProcessResult` 对象，设置到 store
  5. 顶部 ProcessNotification 显示结果
- 处理期间显示 loading 状态（复用 `isVideoProcessing`）
- 错误通过 `message.error()` 提示

### 4. 视频页面集成 — `src/pages/video/index.tsx`

- 在 `tabItems` 数组新增项：`{ key: "extractAudio", label: "导出音频", icon: <AudioOutlined /> }`
- 在功能面板区域新增条件渲染：`videoFunctionTab === "extractAudio" && <VideoExtractAudio />`

### 5. Store — 无变更

复用现有状态：
- `isVideoProcessing` — 处理中标志
- `videoProcessResult` — 处理结果通知
- `setVideoProcessing` / `setVideoProcessResult` — 对应 setter

## 不做的事情

- 不支持多种音频格式输出（仅 MP3）
- 不提供比特率/采样率等音质选项
- 不单独新增 store 状态（完全复用现有 video processing 状态）
