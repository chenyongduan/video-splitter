# MediaKit 音频处理功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有视频分割工具基础上新增音频处理模块（格式转换、压缩、裁剪、元数据读取），并将应用重构为 MediaKit 多功能标签页布局。

**Architecture:** 单 Store 扩展 + 页面目录分离。现有视频组件迁移至 `pages/video/`，音频组件放 `pages/audio/`，`App.tsx` 变为纯标签页容器。所有 FFmpeg/FFprobe 调用走 Tauri sidecar。

**Tech Stack:** React 19, Ant Design 6, Zustand 5, wavesurfer.js 7, Tauri v2 Shell Plugin

---

## Task 1: 安装 wavesurfer.js 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 wavesurfer.js**

Run: `pnpm add wavesurfer.js`

- [ ] **Step 2: 验证安装成功**

Run: `pnpm ls wavesurfer.js`
Expected: 看到 wavesurfer.js 版本号（v7.x）

---

## Task 2: 新增音频类型定义

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 在现有类型之后追加音频相关类型**

在 `src/types/index.ts` 文件末尾追加以下内容：

```typescript
// ===== 全局 =====
export type AppTab = "video" | "audio";

// ===== 音频 =====
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
```

- [ ] **Step 2: 验证类型检查通过**

Run: `pnpm build`
Expected: 无类型错误（可能有现有 import 路径错误，因为文件还没迁移，这是预期的）

---

## Task 3: 创建音频工具函数

**Files:**
- Create: `src/utils/audio.ts`

- [ ] **Step 1: 创建 `src/utils/audio.ts`**

```typescript
import { Command } from "@tauri-apps/plugin-shell";
import type { AudioInfo, ConvertParams, CompressParams, TrimParams } from "../types";

/** 编码器映射：输出格式 → FFmpeg 音频编码器参数 */
const AUDIO_ENCODERS: Record<string, string[]> = {
  mp3: ["-c:a", "libmp3lame"],
  wav: ["-c:a", "pcm_s16le"],
  aac: ["-c:a", "aac"],
  m4a: ["-c:a", "aac"],
  flac: ["-c:a", "flac"],
  ogg: ["-c:a", "libvorbis"],
};

/**
 * 使用 FFprobe 读取音频文件元数据。
 * 调用 ffprobe sidecar，解析 JSON 输出。
 */
export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
  const command = Command.sidecar("binaries/ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
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

  // 找到音频流
  const audioStream = streams.find((s) => s.codec_type === "audio") || streams[0];

  if (!audioStream) {
    throw new Error("未找到音频流");
  }

  const duration = parseFloat(format.duration as string) || 0;
  const bitrate = Math.round(parseInt(format.bit_rate as string, 10) / 1000);
  const sampleRate = parseInt(audioStream.sample_rate as string, 10) || 44100;
  const channels = (audioStream.channels as number) || 2;
  const fileSize = parseInt(format.size as string, 10) || 0;

  // 从 format_name 或文件扩展名推断格式
  const formatName = (format.format_name as string) || "";
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  // format_name 可能是 "mp3", "wav", "mov,mp4,m4a,aac,..." 等复合值
  let audioFormat = ext;
  if (!audioFormat && formatName) {
    const knownFormats = ["mp3", "wav", "aac", "m4a", "flac", "ogg"];
    const matched = knownFormats.find((f) => formatName.includes(f));
    audioFormat = matched || formatName.split(",")[0];
  }

  return {
    duration,
    format: audioFormat,
    bitrate,
    sampleRate,
    channels,
    fileSize,
  };
}

/**
 * 音频格式转换。
 * 根据输出文件扩展名自动选择编码器。
 */
export async function convertAudio(
  inputPath: string,
  outputPath: string,
  _params: ConvertParams,
): Promise<void> {
  const ext = outputPath.split(".").pop()?.toLowerCase() || "";
  const encoderArgs = AUDIO_ENCODERS[ext];
  if (!encoderArgs) {
    throw new Error(`不支持的输出格式: ${ext}`);
  }

  const args = ["-y", "-i", inputPath, ...encoderArgs, outputPath];
  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`格式转换失败: ${result.stderr}`);
  }
}

/**
 * 音频压缩。
 * 保持原格式，调整比特率和采样率。
 */
export async function compressAudio(
  inputPath: string,
  outputPath: string,
  params: CompressParams,
): Promise<void> {
  const args = [
    "-y",
    "-i", inputPath,
    "-b:a", `${params.bitrate}k`,
  ];

  if (params.sampleRate) {
    args.push("-ar", String(params.sampleRate));
  }

  args.push(outputPath);

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`压缩失败: ${result.stderr}`);
  }
}

/**
 * 音频裁剪。
 * 同格式使用 -c copy 无损拷贝，跨格式走重编码。
 */
export async function trimAudio(
  inputPath: string,
  outputPath: string,
  params: TrimParams,
): Promise<void> {
  const inputExt = inputPath.split(".").pop()?.toLowerCase() || "";
  const outputExt = outputPath.split(".").pop()?.toLowerCase() || "";
  const sameFormat = inputExt === outputExt;

  const args = [
    "-y",
    "-ss", String(params.startTime),
    "-to", String(params.endTime),
    "-i", inputPath,
  ];

  if (sameFormat) {
    args.push("-c", "copy");
  } else {
    const encoderArgs = AUDIO_ENCODERS[outputExt];
    if (encoderArgs) {
      args.push(...encoderArgs);
    }
  }

  args.push(outputPath);

  const command = Command.sidecar("binaries/ffmpeg", args);
  const result = await command.execute();

  if (result.code !== 0) {
    throw new Error(`裁剪失败: ${result.stderr}`);
  }
}

/**
 * 获取编码器参数（供外部查询用）
 */
export function getEncoderArgs(format: string): string[] | undefined {
  return AUDIO_ENCODERS[format];
}
```

- [ ] **Step 2: 验证文件无语法错误**

Run: `npx tsc --noEmit src/utils/audio.ts 2>&1 || true`
Expected: 可能有 import 路径相关的错误（因为类型已定义），无语法错误

---

## Task 4: 更新 Tauri 配置

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 更新应用名称、窗口标题、新增 ffprobe sidecar**

将 `src-tauri/tauri.conf.json` 的以下字段更新：

`productName`: `"视频分割工具"` → `"MediaKit"`

`app.windows[0].title`: `"视频分割工具"` → `"MediaKit"`

`bundle.externalBin`: 添加 `"binaries/ffprobe"`，变为：
```json
"externalBin": [
  "binaries/ffmpeg",
  "binaries/ffprobe"
]
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('JSON valid')"`
Expected: `JSON valid`

---

## Task 5: 更新 Tauri 权限配置

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 添加 ffprobe sidecar 的执行和启动权限**

在 `permissions` 数组中，在 `dialog:allow-open` 之后、`fs:allow-mkdir` 之前，添加 `dialog:allow-save` 权限。

同时复制 `shell:allow-execute` 和 `shell:allow-spawn` 的配置块，将 `name` 改为 `"binaries/ffprobe"`。

最终 `permissions` 数组变为：

```json
"permissions": [
  "core:default",
  "opener:default",
  "dialog:default",
  "dialog:allow-open",
  "dialog:allow-save",
  {
    "identifier": "fs:allow-mkdir",
    "allow": [{ "path": "**" }]
  },
  {
    "identifier": "shell:allow-execute",
    "allow": [
      {
        "name": "binaries/ffmpeg",
        "sidecar": true,
        "args": true
      },
      {
        "name": "binaries/ffprobe",
        "sidecar": true,
        "args": true
      }
    ]
  },
  {
    "identifier": "shell:allow-spawn",
    "allow": [
      {
        "name": "binaries/ffmpeg",
        "sidecar": true,
        "args": true
      },
      {
        "name": "binaries/ffprobe",
        "sidecar": true,
        "args": true
      }
    ]
  }
]
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json','utf8')); console.log('JSON valid')"`
Expected: `JSON valid`

---

## Task 6: 扩展 Zustand Store

**Files:**
- Modify: `src/store/segmentStore.ts`

- [ ] **Step 1: 添加音频状态和 action**

在 `segmentStore.ts` 中：

1. 更新 import，添加新的音频类型：
```typescript
import type { Segment, VideoInfo, SplitProgress, AudioInfo, AudioProcessResult, AppTab } from "../types";
```

2. 在 `AppState` 接口中添加音频字段和全局 tab 字段（在现有视频字段之前加全局，在 Split state 之后加音频）：

在接口最前面添加全局 tab：
```typescript
// Global tab state
activeTab: AppTab;
setActiveTab: (tab: AppTab) => void;
```

在 Split state 之后、Video element ref 之前添加音频状态：
```typescript
// Audio state
audioPath: string;
audioFileName: string;
audioInfo: AudioInfo | null;
isAudioLoaded: boolean;
audioFunctionTab: "convert" | "compress" | "trim";
audioProcessResult: AudioProcessResult | null;
isAudioProcessing: boolean;

// Audio actions
setAudioFunctionTab: (tab: string) => void;
setAudioFile: (path: string, fileName: string, info: AudioInfo) => void;
clearAudio: () => void;
setAudioProcessing: (val: boolean) => void;
setAudioProcessResult: (result: AudioProcessResult | null) => void;
```

3. 在 `create<AppState>((set, get) => ({` 实现中添加初始值和 action 实现：

初始值（在 store 最前面）：
```typescript
// Global
activeTab: "video",
setActiveTab: (tab) => set({ activeTab: tab }),
```

音频初始值和 action（在 `setSplitResult` 之后）：
```typescript
// Audio
audioPath: "",
audioFileName: "",
audioInfo: null,
isAudioLoaded: false,
audioFunctionTab: "convert",
audioProcessResult: null,
isAudioProcessing: false,

setAudioFunctionTab: (tab) => set({ audioFunctionTab: tab as "convert" | "compress" | "trim" }),

setAudioFile: (path, fileName, info) =>
  set({
    audioPath: path,
    audioFileName: fileName,
    audioInfo: info,
    isAudioLoaded: true,
    audioProcessResult: null,
  }),

clearAudio: () =>
  set({
    audioPath: "",
    audioFileName: "",
    audioInfo: null,
    isAudioLoaded: false,
    audioFunctionTab: "convert",
    audioProcessResult: null,
    isAudioProcessing: false,
  }),

setAudioProcessing: (val) => set({ isAudioProcessing: val }),
setAudioProcessResult: (result) => set({ audioProcessResult: result }),
```

- [ ] **Step 2: 验证类型检查通过**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 可能有组件路径相关的错误（组件尚未迁移），store 本身无类型错误

---

## Task 7: 创建页面目录结构并迁移视频组件

**Files:**
- Create: `src/pages/video/index.tsx` （从 App.tsx 中提取视频逻辑）
- Move: `src/components/VideoPlayer.tsx` → `src/pages/video/VideoPlayer.tsx`
- Move: `src/components/SegmentTable.tsx` → `src/pages/video/SegmentTable.tsx`
- Move: `src/components/SegmentEditor.tsx` → `src/pages/video/SegmentEditor.tsx`
- Move: `src/components/ProgressDialog.tsx` → `src/pages/video/ProgressDialog.tsx`

- [ ] **Step 1: 创建目录**

Run:
```bash
mkdir -p src/pages/video src/pages/audio
```

- [ ] **Step 2: 移动视频组件文件**

Run:
```bash
mv src/components/VideoPlayer.tsx src/pages/video/
mv src/components/SegmentTable.tsx src/pages/video/
mv src/components/SegmentEditor.tsx src/pages/video/
mv src/components/ProgressDialog.tsx src/pages/video/
```

- [ ] **Step 3: 修复移动后文件中的 import 路径**

移动后的文件中相对路径 `../store/segmentStore` 和 `../types` 和 `../utils/format` 变成了 `../../store/segmentStore`、`../../types`、`../../utils/format`。

需要修复的文件和 import：

**`src/pages/video/VideoPlayer.tsx`：**
- `"../store/segmentStore"` → `"../../store/segmentStore"`
- `"../utils/format"` → `"../../utils/format"`

**`src/pages/video/SegmentTable.tsx`：**
- `"../types"` → `"../../types"`
- `"../utils/format"` → `"../../utils/format"`
- `"../store/segmentStore"` → `"../../store/segmentStore"`

**`src/pages/video/SegmentEditor.tsx`：**
- `"../utils/format"` → `"../../utils/format"`

**`src/pages/video/ProgressDialog.tsx`：**
- 无需修改（无相对路径 import）

- [ ] **Step 4: 创建视频页面入口 `src/pages/video/index.tsx`**

将现有 `App.tsx` 中的视频分割全部逻辑提取到此文件：

```typescript
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Space,
  Typography,
  Card,
  message,
  Tag,
  Alert,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  ScissorOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getVideoInfo, splitVideo } from "../../utils/ffmpeg";
import VideoPlayer from "./VideoPlayer";
import SegmentTable from "./SegmentTable";
import ProgressDialog from "./ProgressDialog";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";

const { Text } = Typography;

const SUPPORTED_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

const VideoPage: React.FC = () => {
  const {
    videoPath,
    videoInfo,
    videoFileName,
    isVideoLoaded,
    segments,
    isSplitting,
    progress,
    splitResult,
    setVideo,
    clearVideo,
    addSegment,
    removeSegment,
    setSplitting,
    setProgress,
    setSplitResult,
  } = useAppStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const loadVideoFile = useCallback(
    async (filePath: string) => {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        message.error(`不支持的格式: .${ext}，仅支持 ${SUPPORTED_EXTENSIONS.join(", ")}`);
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "video.mp4";

      try {
        const info = await getVideoInfo(filePath);
        setVideo(filePath, fileName, info);
        message.success(`已加载: ${fileName}`);
      } catch (err) {
        message.error(`加载失败: ${err}`);
      }
    },
    [setVideo]
  );

  const handleLoadVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "视频文件",
            extensions: SUPPORTED_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;
      await loadVideoFile(selected as string);
    } catch (err) {
      message.error(`选择文件失败: ${err}`);
    }
  }, [loadVideoFile]);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          loadVideoFile(files[0]);
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
  }, [loadVideoFile]);

  const handleAddSegment = useCallback(() => {
    if (!videoInfo) return;
    const duration = videoInfo.duration;

    const lastEnd =
      segments.length > 0 ? segments[segments.length - 1].end : 0;
    const start = lastEnd;
    const end = Math.min(start + 30, duration);

    if (start >= duration) {
      message.warning("已到达视频末尾");
      return;
    }

    addSegment(start, end);
  }, [videoInfo, segments, addSegment]);

  const handleSplit = useCallback(async () => {
    if (segments.length === 0) {
      message.warning("请先添加分割区间");
      return;
    }

    for (const seg of segments) {
      if (seg.start >= seg.end) {
        message.error(
          `区间 ${formatTime(seg.start)} - ${formatTime(seg.end)} 无效：开始时间必须小于结束时间`
        );
        return;
      }
      if (videoInfo && seg.end > videoInfo.duration) {
        message.error(
          `区间 ${formatTime(seg.start)} - ${formatTime(seg.end)} 超出视频时长`
        );
        return;
      }
    }

    setSplitting(true);
    setProgress(null);
    setSplitResult(null);

    try {
      const result = await splitVideo(videoPath, segments, (p) => {
        setProgress(p);
      });
      setSplitResult(result);
      message.success("切割完成！");
    } catch (err) {
      message.error(`切割失败: ${err}`);
    } finally {
      setSplitting(false);
    }
  }, [segments, videoPath, videoInfo, setSplitting, setProgress, setSplitResult]);

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto", width: "100%" }}>
      {!isVideoLoaded ? (
        <Card style={{ marginTop: 48 }}>
          <div
            ref={dropRef}
            onClick={handleLoadVideo}
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
              拖拽视频文件到此处，或点击选择
            </p>
            <p style={{ color: "#999" }}>
              支持 MP4, MOV, MKV, AVI, WebM 格式
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Text strong ellipsis style={{ maxWidth: 400 }}>{videoFileName}</Text>
              {videoInfo && (
                <>
                  <Tag color="blue">{videoInfo.width}×{videoInfo.height}</Tag>
                  <Tag color="green">{formatTime(videoInfo.duration)}</Tag>
                </>
              )}
            </div>
            <Space>
              <Button icon={<FolderOpenOutlined />} onClick={handleLoadVideo}>选择视频</Button>
              <Button danger icon={<DeleteOutlined />} onClick={clearVideo}>清除</Button>
            </Space>
          </div>

          {/* Video Player */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <VideoPlayer />
          </Card>

          {/* Segment Section */}
          <Card
            size="small"
            title="分割区间"
            extra={
              <Space size={4}>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddSegment}
                >
                  添加区间
                </Button>
                <Popconfirm
                  title="确定清空所有分割区间？"
                  onConfirm={() => useAppStore.getState().clearSegments()}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button size="small" danger disabled={segments.length === 0}>
                    清空
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <SegmentTable segments={segments} onRemove={removeSegment} />
          </Card>

          {/* Split button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Button
              type="primary"
              size="large"
              icon={<ScissorOutlined />}
              onClick={handleSplit}
              loading={isSplitting}
              disabled={segments.length === 0}
            >
              开始切割 ({segments.length} 段)
            </Button>
          </div>

          {/* Result */}
          {splitResult && (
            <Alert
              style={{ marginTop: 12 }}
              message="切割完成"
              description={`输出目录: ${splitResult}`}
              type="success"
              showIcon
            />
          )}
        </>
      )}

      <ProgressDialog
        open={isSplitting}
        current={progress?.current || 0}
        total={progress?.total || 0}
        percent={progress?.percent || 0}
      />
    </div>
  );
};

export default VideoPage;
```

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "refactor: migrate video components to pages/video/ directory"
```

---

## Task 8: 创建 AudioDropZone 组件

**Files:**
- Create: `src/pages/audio/AudioDropZone.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";

const SUPPORTED_AUDIO_EXTENSIONS = ["mp3", "wav", "aac", "m4a", "flac", "ogg"];

const AudioDropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const setAudioFile = useAppStore((s) => s.setAudioFile);

  const loadAudioFile = useCallback(
    async (filePath: string) => {
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
        message.error(`不支持的格式: .${ext}，仅支持 ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`);
        return;
      }

      const fileName = filePath.split(/[/\\]/).pop() || "audio.mp3";

      try {
        const info = await getAudioInfo(filePath);
        setAudioFile(filePath, fileName, info);
        message.success(`已加载: ${fileName}`);
      } catch (err) {
        message.error(`加载失败: ${err}，文件可能已损坏`);
      }
    },
    [setAudioFile]
  );

  const handleSelectFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "音频文件",
            extensions: SUPPORTED_AUDIO_EXTENSIONS,
          },
        ],
      });
      if (!selected) return;
      await loadAudioFile(selected as string);
    } catch (err) {
      message.error(`选择文件失败: ${err}`);
    }
  }, [loadAudioFile]);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const unlisten = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        const files = event.payload.paths;
        if (files && files.length > 0) {
          loadAudioFile(files[0]);
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
  }, [loadAudioFile]);

  return (
    <Card style={{ marginTop: 48 }}>
      <div
        ref={dropRef}
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
          拖拽音频文件到此处，或点击选择文件
        </p>
        <p style={{ color: "#999" }}>
          支持 MP3、WAV、AAC、M4A、FLAC、OGG 格式
        </p>
      </div>
    </Card>
  );
};

export default AudioDropZone;
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/AudioDropZone.tsx && git commit -m "feat: add AudioDropZone component"
```

---

## Task 9: 创建 AudioMetadata 组件

**Files:**
- Create: `src/pages/audio/AudioMetadata.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React from "react";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";

const AudioMetadata: React.FC = () => {
  const audioInfo = useAppStore((s) => s.audioInfo);

  if (!audioInfo) return null;

  const channelLabel = audioInfo.channels === 1 ? "单声道" : "双声道";

  const items = [
    { label: "时长", value: formatTime(audioInfo.duration) },
    { label: "格式", value: audioInfo.format.toUpperCase() },
    { label: "比特率", value: `${audioInfo.bitrate}kbps` },
    { label: "采样率", value: `${audioInfo.sampleRate}Hz` },
    { label: "声道", value: channelLabel },
  ];

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        border: "1px solid #e8e8e8",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
        📋 音频信息
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {items.map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999" }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AudioMetadata;
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/AudioMetadata.tsx && git commit -m "feat: add AudioMetadata component"
```

---

## Task 10: 创建 AudioWaveform 组件

**Files:**
- Create: `src/pages/audio/AudioWaveform.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Space, message } from "antd";
import { PlayCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";

const AudioWaveform: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFunctionTab = useAppStore((s) => s.audioFunctionTab);

  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [regionStart, setRegionStart] = useState<number>(0);
  const [regionEnd, setRegionEnd] = useState<number>(0);

  // Store trim range in window-level ref for AudioTrimmer to read
  const trimRangeRef = useRef({ start: 0, end: 0 });

  // Expose trim range getter globally for sibling components
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__audioTrimRange = {
      get: () => ({ start: trimRangeRef.current.start, end: trimRangeRef.current.end }),
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__audioTrimRange;
    };
  }, []);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioPath) return;

    // Destroy previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#91caff",
      progressColor: "#1677ff",
      cursorColor: "#1677ff",
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;
    wavesurferRef.current = ws;

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    // Load audio via Tauri asset protocol
    const src = convertFileSrc(audioPath);
    ws.load(src);

    // After ready, add default region spanning full duration
    ws.on("ready", () => {
      const duration = ws.getDuration();
      setRegionEnd(duration);
      trimRangeRef.current = { start: 0, end: duration };

      regions.addRegion({
        start: 0,
        end: duration,
        color: "rgba(22, 119, 255, 0.15)",
        drag: true,
        resize: true,
      });
    });

    // Track region changes
    regions.on("region-updated", (region) => {
      const start = region.start;
      const end = region.end;
      setRegionStart(start);
      setRegionEnd(end);
      trimRangeRef.current = { start, end };
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioPath]);

  const togglePlay = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.playPause();
  }, []);

  const handlePlayRegion = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    ws.play(regionStart, regionEnd);
  }, [regionStart, regionEnd]);

  if (!audioPath || !audioInfo) return null;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        border: "1px solid #e8e8e8",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🔊 波形预览</span>
        <Space size={8}>
          <Button
            size="small"
            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={togglePlay}
          >
            {isPlaying ? "暂停" : "播放"}
          </Button>
          {audioFunctionTab === "trim" && (
            <Button size="small" type="primary" onClick={handlePlayRegion}>
              播放选中
            </Button>
          )}
        </Space>
      </div>

      <div
        ref={containerRef}
        style={{
          background: "#f0f5ff",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 6,
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999" }}>
        <span>00:00</span>
        {audioFunctionTab === "trim" && (
          <span style={{ color: "#1677ff" }}>
            选中：{formatTime(regionStart)} — {formatTime(regionEnd)}
          </span>
        )}
        <span>{formatTime(audioInfo.duration)}</span>
      </div>
    </div>
  );
};

export default AudioWaveform;
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/AudioWaveform.tsx && git commit -m "feat: add AudioWaveform component with wavesurfer.js"
```

---

## Task 11: 创建 AudioConverter 组件

**Files:**
- Create: `src/pages/audio/AudioConverter.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React, { useCallback, useState } from "react";
import { Button, Select, Space, message } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertAudio, getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";
import type { AudioProcessResult } from "../../types";

const OUTPUT_FORMATS = ["mp3", "wav", "aac", "m4a", "flac", "ogg"];

const AudioConverter: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const setAudioProcessing = useAppStore((s) => s.setAudioProcessing);
  const setAudioProcessResult = useAppStore((s) => s.setAudioProcessResult);

  const [outputFormat, setOutputFormat] = useState<string>("wav");

  // Filter out current format
  const availableFormats = OUTPUT_FORMATS.filter(
    (f) => f !== audioInfo?.format?.toLowerCase()
  );

  const handleConvert = useCallback(async () => {
    if (!audioPath || !audioInfo) return;

    const baseName = audioFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_converted.${outputFormat}`;

    try {
      const selected = await save({
        defaultPath,
        filters: [
          {
            name: `${outputFormat.toUpperCase()} 文件`,
            extensions: [outputFormat],
          },
        ],
      });
      if (!selected) return;

      setAudioProcessing(true);
      setAudioProcessResult(null);

      await convertAudio(audioPath, selected, { outputFormat });

      // Read output file info for comparison
      const outputInfo = await getAudioInfo(selected);

      const result: AudioProcessResult = {
        inputPath: audioPath,
        outputPath: selected,
        inputFormat: audioInfo.format,
        outputFormat,
        inputSize: audioInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputBitrate: audioInfo.bitrate,
        outputBitrate: outputInfo.bitrate,
        inputSampleRate: audioInfo.sampleRate,
        outputSampleRate: outputInfo.sampleRate,
        duration: audioInfo.duration,
        taskType: "convert",
      };

      setAudioProcessResult(result);
      message.success("格式转换完成！");
    } catch (err) {
      message.error(`转换失败: ${err}`);
    } finally {
      setAudioProcessing(false);
    }
  }, [audioPath, audioInfo, audioFileName, outputFormat, setAudioProcessing, setAudioProcessResult]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        border: "1px solid #e8e8e8",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>输出格式</div>
          <Select
            value={outputFormat}
            onChange={setOutputFormat}
            style={{ minWidth: 120 }}
            options={availableFormats.map((f) => ({ label: f.toUpperCase(), value: f }))}
          />
        </div>
        <div style={{ flex: 1 }} />
        <Button
          type="primary"
          icon={<SwapOutlined />}
          onClick={handleConvert}
        >
          开始转换
        </Button>
      </div>
    </div>
  );
};

export default AudioConverter;
```

注意：`invoke` import 实际未使用，应移除。最终代码中不要 `import { invoke }` 这行。

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/AudioConverter.tsx && git commit -m "feat: add AudioConverter component"
```

---

## Task 12: 创建 AudioCompressor 组件

**Files:**
- Create: `src/pages/audio/AudioCompressor.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React, { useCallback, useState } from "react";
import { Button, Radio, InputNumber, Space, message } from "antd";
import { CompressOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { compressAudio, getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";
import type { AudioProcessResult } from "../../types";

interface PresetOption {
  label: string;
  bitrate: number;
  description: string;
}

const PRESETS: PresetOption[] = [
  { label: "高质量", bitrate: 256, description: "音质损失较小" },
  { label: "标准压缩", bitrate: 128, description: "兼顾音质和体积" },
  { label: "强力压缩", bitrate: 64, description: "文件更小" },
];

const CUSTOM_BITRATES = [64, 128, 192, 256, 320];

const AudioCompressor: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const setAudioProcessing = useAppStore((s) => s.setAudioProcessing);
  const setAudioProcessResult = useAppStore((s) => s.setAudioProcessResult);

  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetIndex, setPresetIndex] = useState(1); // default: 标准
  const [customBitrate, setCustomBitrate] = useState(128);

  const bitrate = mode === "preset" ? PRESETS[presetIndex].bitrate : customBitrate;

  const handleCompress = useCallback(async () => {
    if (!audioPath || !audioInfo) return;

    const ext = audioInfo.format.toLowerCase();
    const baseName = audioFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_${bitrate}kbps.${ext}`;

    try {
      const selected = await save({
        defaultPath,
        filters: [
          {
            name: `${ext.toUpperCase()} 文件`,
            extensions: [ext],
          },
        ],
      });
      if (!selected) return;

      setAudioProcessing(true);
      setAudioProcessResult(null);

      await compressAudio(audioPath, selected, { bitrate });

      const outputInfo = await getAudioInfo(selected);

      const result: AudioProcessResult = {
        inputPath: audioPath,
        outputPath: selected,
        inputFormat: audioInfo.format,
        outputFormat: outputInfo.format,
        inputSize: audioInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputBitrate: audioInfo.bitrate,
        outputBitrate: outputInfo.bitrate,
        inputSampleRate: audioInfo.sampleRate,
        outputSampleRate: outputInfo.sampleRate,
        duration: audioInfo.duration,
        taskType: "compress",
      };

      setAudioProcessResult(result);
      message.success("压缩完成！");
    } catch (err) {
      message.error(`压缩失败: ${err}`);
    } finally {
      setAudioProcessing(false);
    }
  }, [audioPath, audioInfo, audioFileName, bitrate, setAudioProcessing, setAudioProcessResult]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        border: "1px solid #e8e8e8",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ marginBottom: 8 }}
        >
          <Radio value="preset">预设压缩</Radio>
          <Radio value="custom">自定义比特率</Radio>
        </Radio.Group>

        {mode === "preset" ? (
          <div style={{ display: "flex", gap: 8 }}>
            {PRESETS.map((p, i) => (
              <div
                key={i}
                onClick={() => setPresetIndex(i)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  border: `2px solid ${presetIndex === i ? "#1677ff" : "#d9d9d9"}`,
                  cursor: "pointer",
                  textAlign: "center",
                  background: presetIndex === i ? "#e6f4ff" : "#fff",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: presetIndex === i ? "#1677ff" : "#333" }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0" }}>
                  {p.bitrate}kbps
                </div>
                <div style={{ fontSize: 12, color: "#999" }}>{p.description}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>目标比特率：</span>
            <Radio.Group
              value={customBitrate}
              onChange={(e) => setCustomBitrate(e.target.value)}
            >
              {CUSTOM_BITRATES.map((br) => (
                <Radio.Button key={br} value={br}>
                  {br}kbps
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<CompressOutlined />}
          onClick={handleCompress}
        >
          开始压缩
        </Button>
      </div>
    </div>
  );
};

export default AudioCompressor;
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/AudioCompressor.tsx && git commit -m "feat: add AudioCompressor component"
```

---

## Task 13: 创建 AudioTrimmer 组件

**Files:**
- Create: `src/pages/audio/AudioTrimmer.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React, { useCallback, useEffect, useState } from "react";
import { Button, InputNumber, Space, Typography, message } from "antd";
import { ScissorOutlined } from "@ant-design/icons";
import { save } from "@tauri-apps/plugin-dialog";
import { trimAudio, getAudioInfo } from "../../utils/audio";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";
import type { AudioProcessResult, TrimParams } from "../../types";

const AudioTrimmer: React.FC = () => {
  const audioPath = useAppStore((s) => s.audioPath);
  const audioInfo = useAppStore((s) => s.audioInfo);
  const audioFileName = useAppStore((s) => s.audioFileName);
  const setAudioProcessing = useAppStore((s) => s.setAudioProcessing);
  const setAudioProcessResult = useAppStore((s) => s.setAudioProcessResult);

  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  const duration = audioInfo?.duration || 0;

  // Sync with waveform region selection
  useEffect(() => {
    const interval = setInterval(() => {
      const trimRange = (window as unknown as Record<string, { get: () => { start: number; end: number } }>).__audioTrimRange;
      if (trimRange) {
        const { start, end } = trimRange.get();
        setStartTime(Math.round(start * 10) / 10);
        setEndTime(Math.round(end * 10) / 10);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleTrim = useCallback(async () => {
    if (!audioPath || !audioInfo) return;

    const params: TrimParams = { startTime, endTime };

    // Validate
    if (params.startTime < 0) {
      message.error("开始时间不能小于 0");
      return;
    }
    if (params.endTime > duration) {
      message.error("结束时间不能大于音频总时长");
      return;
    }
    if (params.startTime >= params.endTime) {
      message.error("结束时间必须大于开始时间");
      return;
    }

    const ext = audioInfo.format.toLowerCase();
    const baseName = audioFileName.replace(/\.[^.]+$/, "");
    const defaultPath = `${baseName}_${formatTime(params.startTime).replace(/:/g, "-")}_${formatTime(params.endTime).replace(/:/g, "-")}.${ext}`;

    try {
      const selected = await save({
        defaultPath,
        filters: [
          {
            name: `${ext.toUpperCase()} 文件`,
            extensions: [ext],
          },
        ],
      });
      if (!selected) return;

      setAudioProcessing(true);
      setAudioProcessResult(null);

      await trimAudio(audioPath, selected, params);

      const outputInfo = await getAudioInfo(selected);

      const result: AudioProcessResult = {
        inputPath: audioPath,
        outputPath: selected,
        inputFormat: audioInfo.format,
        outputFormat: outputInfo.format,
        inputSize: audioInfo.fileSize,
        outputSize: outputInfo.fileSize,
        inputBitrate: audioInfo.bitrate,
        outputBitrate: outputInfo.bitrate,
        inputSampleRate: audioInfo.sampleRate,
        outputSampleRate: outputInfo.sampleRate,
        duration: params.endTime - params.startTime,
        taskType: "trim",
      };

      setAudioProcessResult(result);
      message.success("裁剪完成！");
    } catch (err) {
      message.error(`裁剪失败: ${err}`);
    } finally {
      setAudioProcessing(false);
    }
  }, [audioPath, audioInfo, audioFileName, startTime, endTime, duration, setAudioProcessing, setAudioProcessResult]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 16,
        border: "1px solid #e8e8e8",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <Typography.Text style={{ fontSize: 12, color: "#999" }}>开始时间</Typography.Text>
          <InputNumber
            min={0}
            max={duration}
            step={0.1}
            value={startTime}
            onChange={(v) => setStartTime(v || 0)}
            addonAfter={formatTime(startTime)}
            style={{ width: 180 }}
          />
        </div>
        <div>
          <Typography.Text style={{ fontSize: 12, color: "#999" }}>结束时间</Typography.Text>
          <InputNumber
            min={0}
            max={duration}
            step={0.1}
            value={endTime}
            onChange={(v) => setEndTime(v || 0)}
            addonAfter={formatTime(endTime)}
            style={{ width: 180 }}
          />
        </div>
        <div style={{ fontSize: 13, color: "#666", alignSelf: "center" }}>
          时长：{formatTime(endTime - startTime)}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="primary"
          icon={<ScissorOutlined />}
          onClick={handleTrim}
        >
          开始裁剪
        </Button>
      </div>
    </div>
  );
};

export default AudioTrimmer;
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/AudioTrimmer.tsx && git commit -m "feat: add AudioTrimmer component"
```

---

## Task 14: 创建音频页面入口

**Files:**
- Create: `src/pages/audio/index.tsx`

- [ ] **Step 1: 创建文件**

```typescript
import React from "react";
import { Button, Space, Typography, Tag, Alert, Tabs, Spin } from "antd";
import { FolderOpenOutlined, DeleteOutlined, FolderOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/segmentStore";
import { formatTime } from "../../utils/format";
import AudioDropZone from "./AudioDropZone";
import AudioMetadata from "./AudioMetadata";
import AudioWaveform from "./AudioWaveform";
import AudioConverter from "./AudioConverter";
import AudioCompressor from "./AudioCompressor";
import AudioTrimmer from "./AudioTrimmer";

const { Text } = Typography;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const AudioPage: React.FC = () => {
  const {
    isAudioLoaded,
    audioFileName,
    audioInfo,
    audioPath,
    audioFunctionTab,
    setAudioFunctionTab,
    audioProcessResult,
    isAudioProcessing,
    clearAudio,
    setAudioProcessResult,
  } = useAppStore();

  if (!isAudioLoaded) {
    return (
      <div style={{ padding: 16, maxWidth: 960, margin: "0 auto", width: "100%" }}>
        <AudioDropZone />
      </div>
    );
  }

  const handleOpenDir = async () => {
    if (audioProcessResult?.outputPath) {
      const dir = audioProcessResult.outputPath.replace(/[/\\][^/\\]+$/, "");
      await open(dir);
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text strong ellipsis style={{ maxWidth: 400 }}>{audioFileName}</Text>
          {audioInfo && (
            <>
              <Tag color="blue">{audioInfo.format.toUpperCase()}</Tag>
              <Tag color="green">{formatTime(audioInfo.duration)}</Tag>
            </>
          )}
        </div>
        <Space>
          <Button icon={<DeleteOutlined />} onClick={clearAudio}>重新选择</Button>
        </Space>
      </div>

      {/* Metadata */}
      <AudioMetadata />

      {/* Waveform */}
      <AudioWaveform />

      {/* Function Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["convert", "compress", "trim"] as const).map((tab) => {
          const labels = { convert: "格式转换", compress: "音频压缩", trim: "音频裁剪" };
          const active = audioFunctionTab === tab;
          return (
            <div
              key={tab}
              onClick={() => setAudioFunctionTab(tab)}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                cursor: "pointer",
                background: active ? "#1677ff" : "#fff",
                color: active ? "#fff" : "#333",
                border: `1px solid ${active ? "#1677ff" : "#d9d9d9"}`,
                transition: "all 0.2s",
              }}
            >
              {labels[tab]}
            </div>
          );
        })}
      </div>

      {/* Function Panel */}
      <Spin spinning={isAudioProcessing} tip="处理中...">
        {audioFunctionTab === "convert" && <AudioConverter />}
        {audioFunctionTab === "compress" && <AudioCompressor />}
        {audioFunctionTab === "trim" && <AudioTrimmer />}
      </Spin>

      {/* Result */}
      {audioProcessResult && (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message="处理完成"
          description={
            <div style={{ fontSize: 13 }}>
              <div>文件名：{audioProcessResult.inputPath.split(/[/\\]/).pop()} → {audioProcessResult.outputPath.split(/[/\\]/).pop()}</div>
              <div>格式：{audioProcessResult.inputFormat.toUpperCase()} → {audioProcessResult.outputFormat.toUpperCase()}</div>
              <div>文件大小：{formatFileSize(audioProcessResult.inputSize)} → {formatFileSize(audioProcessResult.outputSize)}</div>
              <div>比特率：{audioProcessResult.inputBitrate}kbps → {audioProcessResult.outputBitrate}kbps</div>
              <div>采样率：{audioProcessResult.inputSampleRate}Hz → {audioProcessResult.outputSampleRate}Hz</div>
              <div>时长：{formatTime(audioProcessResult.duration)}</div>
              <Button
                size="small"
                icon={<FolderOutlined />}
                style={{ marginTop: 8 }}
                onClick={handleOpenDir}
              >
                打开文件所在目录
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
};

export default AudioPage;
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/audio/index.tsx && git commit -m "feat: add AudioPage entry component"
```

---

## Task 15: 重写 App.tsx 为标签页容器

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 替换 App.tsx 全部内容**

```typescript
import React from "react";
import { Layout, Tabs } from "antd";
import { useAppStore } from "./store/segmentStore";
import VideoPage from "./pages/video";
import AudioPage from "./pages/audio";

const { Header, Content } = Layout;

const App: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <Header
        style={{
          background: "#fff",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: "#1677ff", whiteSpace: "nowrap" }}>
          MediaKit
        </span>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as "video" | "audio")}
          items={[
            { key: "video", label: "视频分割" },
            { key: "audio", label: "音频处理" },
            { key: "image", label: "图片处理", disabled: true },
          ]}
          style={{ marginBottom: 0 }}
        />
      </Header>

      <Content>
        {activeTab === "video" && <VideoPage />}
        {activeTab === "audio" && <AudioPage />}
      </Content>
    </Layout>
  );
};

export default App;
```

- [ ] **Step 2: 删除空的 components 目录**

Run: `rmdir src/components 2>/dev/null; true`

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "feat: rewrite App.tsx as tab container for MediaKit"
```

---

## Task 16: 更新样式

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: 添加音频相关和标签页样式**

在 `src/App.css` 末尾追加：

```css
/* MediaKit tab bar */
.ant-tabs-nav {
  margin-bottom: 0 !important;
}

.ant-tabs-tab {
  padding: 8px 0 !important;
}

/* Header layout fix */
.ant-layout-header {
  height: 56px;
  line-height: 56px;
}

/* Audio waveform container */
audio {
  display: none;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/App.css && git commit -m "style: update App.css for MediaKit tabs and audio components"
```

---

## Task 17: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新项目概述和架构描述**

在 CLAUDE.md 中更新以下内容：

1. 项目概述：将"视频分割工具"改为"MediaKit — 一款多功能媒体处理桌面应用，支持视频分割和音频处理"
2. 前端结构部分：添加 `pages/audio/` 和 `pages/video/` 目录说明，移除旧的 `components/` 说明
3. 依赖部分：添加 wavesurfer.js
4. 提及 FFprobe sidecar

- [ ] **Step 2: 提交**

```bash
git add CLAUDE.md && git commit -m "docs: update CLAUDE.md for MediaKit audio feature"
```

---

## Task 18: 验证编译通过

- [ ] **Step 1: 运行 TypeScript 编译检查**

Run: `pnpm build`
Expected: 编译成功，无类型错误

- [ ] **Step 2: 如有错误，修复并提交**

常见的可能错误：
- import 路径不正确（检查 pages/ 下的文件 import）
- Ant Design Tabs API 变化（v6 使用 `items` 属性而非 `TabPane` 子组件）
- wavesurfer.js 类型定义

修复后提交：`git commit -m "fix: resolve compilation errors"`

- [ ] **Step 3: 最终提交汇总（如有修复）**

---

## Spec 覆盖率检查

| Spec 需求 | 对应 Task |
|-----------|----------|
| 应用更名为 MediaKit | Task 4, Task 15 |
| 顶部标签页切换 | Task 15 |
| pages 目录结构 | Task 7 |
| 音频类型定义 | Task 2 |
| FFprobe 元数据读取 | Task 3 |
| 格式转换 | Task 3 (convertAudio), Task 11 |
| 音频压缩 | Task 3 (compressAudio), Task 12 |
| 音频裁剪 | Task 3 (trimAudio), Task 13 |
| 波形可视化 + 区域选择 | Task 10 |
| 处理结果对比展示 | Task 14 (AudioPage) |
| 另存为对话框 | Task 11, 12, 13 |
| 异常处理 | Task 8 (格式校验), Task 13 (时间校验), Task 3 (FFmpeg 错误) |
| Store 扩展 | Task 6 |
| ffprobe sidecar 声明 | Task 4, Task 5 |
| wavesurfer.js 依赖 | Task 1 |
