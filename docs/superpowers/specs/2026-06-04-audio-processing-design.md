# 音频处理功能设计文档

**日期：** 2026-06-04
**状态：** 已批准
**范围：** MediaKit 音频处理 MVP — 格式转换、音频压缩、音频裁剪、元数据读取

## 1. 概述

在现有视频分割工具基础上，新增音频处理模块。应用更名为 **MediaKit**，采用顶部标签页切换视频分割和音频处理两个功能模块。后续计划加入图片处理。

## 2. 架构决策

### 2.1 整体布局

- **顶部标签页**固定，切换「视频分割」「音频处理」「图片处理（禁用）」
- 每个功能模块是独立的页面组件，通过 `App.tsx` 中的条件渲染切换
- 音频处理内部用子标签切换「格式转换」「音频压缩」「音频裁剪」

### 2.2 状态管理

采用 **单 Store 扩展**方案，在现有 `useAppStore` 中新增音频状态切片，与视频状态结构对称。

理由：
- 目前只有两个模块，单 Store 完全 hold 得住
- 和现有视频分割的架构一致，降低理解成本
- 等未来图片模块加入时再考虑拆分

### 2.3 目录结构

```
src/
├── types/
│   └── index.ts              # 新增 AudioInfo、AudioTask 等类型
├── utils/
│   ├── ffmpeg.ts             # 现有，不变
│   ├── audio.ts              # 新增：FFprobe 元数据读取 + 音频处理命令
│   └── format.ts             # 现有，不变
├── store/
│   └── segmentStore.ts       # 扩展：新增音频状态 + activeTab
├── pages/
│   ├── video/                # 视频分割页面
│   │   ├── index.tsx          # 视频页面入口
│   │   ├── VideoPlayer.tsx
│   │   ├── SegmentTable.tsx
│   │   ├── SegmentEditor.tsx
│   │   └── ProgressDialog.tsx
│   └── audio/                # 音频处理页面
│       ├── index.tsx          # 音频页面入口
│       ├── AudioDropZone.tsx  # 音频文件拖拽/选择区
│       ├── AudioWaveform.tsx  # wavesurfer.js 波形 + 区域选择
│       ├── AudioMetadata.tsx  # 音频信息展示卡片
│       ├── AudioConverter.tsx # 格式转换面板
│       ├── AudioCompressor.tsx# 音频压缩面板
│       └── AudioTrimmer.tsx   # 音频裁剪面板
├── components/               # 公共组件
│   └── FileDropZone.tsx      # 通用文件拖拽区
├── App.tsx                   # 改造：顶部标签页 + 页面渲染
└── App.css
```

**迁移要点：**
- 现有 `components/` 下的视频组件移至 `pages/video/`
- `components/` 只放可复用的公共组件
- 新增音频组件放 `pages/audio/`

## 3. 类型定义

```typescript
// ===== 全局 =====
type AppTab = 'video' | 'audio'

// ===== 音频 =====
interface AudioInfo {
  duration: number       // 秒
  format: string         // "mp3" | "wav" | "aac" | "m4a" | "flac" | "ogg"
  bitrate: number        // kbps
  sampleRate: number     // Hz
  channels: number       // 声道数 (1=单声道, 2=双声道)
  fileSize: number       // 字节
}

type AudioTaskType = 'convert' | 'compress' | 'trim'

interface ConvertParams {
  outputFormat: string   // 目标格式
}

interface CompressParams {
  bitrate: number        // 目标比特率 kbps (64 | 128 | 192 | 256 | 320)
  sampleRate?: number    // 目标采样率 Hz（可选）
}

interface TrimParams {
  startTime: number      // 开始时间（秒）
  endTime: number        // 结束时间（秒）
}

interface AudioProcessResult {
  inputPath: string
  outputPath: string
  inputFormat: string
  outputFormat: string
  inputSize: number
  outputSize: number
  inputBitrate: number
  outputBitrate: number
  inputSampleRate: number
  outputSampleRate: number
  duration: number
  taskType: AudioTaskType
}
```

## 4. Store 扩展

在 `useAppStore` 中新增：

```typescript
interface AppState {
  // ===== 全局 =====
  activeTab: AppTab
  setActiveTab: (tab: AppTab) => void

  // ===== 视频（现有，不变）=====
  // ... 现有字段和 action

  // ===== 音频（新增）=====
  audioPath: string
  audioFileName: string
  audioInfo: AudioInfo | null
  isAudioLoaded: boolean

  audioFunctionTab: 'convert' | 'compress' | 'trim'
  setAudioFunctionTab: (tab: string) => void

  isAudioProcessing: boolean
  audioProcessResult: AudioProcessResult | null

  setAudioFile: (path: string) => void
  clearAudio: () => void
  setAudioProcessing: (v: boolean) => void
  setAudioProcessResult: (r: AudioProcessResult | null) => void
}
```

音频与视频状态结构对称（`xxxPath`、`xxxInfo`、`isXxxLoaded`），保持一致的心智模型。

## 5. 音频工具函数 (`src/utils/audio.ts`)

### 5.1 元数据读取

```typescript
getAudioInfo(filePath: string): Promise<AudioInfo>
```

- 调用 FFprobe sidecar：`ffprobe -v quiet -print_format json -show_format -show_streams <filePath>`
- 解析 JSON 输出提取 duration、format、bitrate、sampleRate、channels、fileSize
- 需要新增 `binaries/ffprobe` sidecar 声明

### 5.2 格式转换

```typescript
convertAudio(inputPath: string, outputPath: string, params: ConvertParams): Promise<void>
```

- 命令：`ffmpeg -y -i <input> -c:a <encoder> <output>`
- 通过输出文件扩展名自动选择编码器

### 5.3 音频压缩

```typescript
compressAudio(inputPath: string, outputPath: string, params: CompressParams): Promise<void>
```

- 命令：`ffmpeg -y -i <input> -b:a <bitrate>k [-ar <sampleRate>] <output>`
- 保持原格式，只改比特率和采样率

### 5.4 音频裁剪

```typescript
trimAudio(inputPath: string, outputPath: string, params: TrimParams): Promise<void>
```

- 同格式：`ffmpeg -y -ss <start> -to <end> -i <input> -c copy <output>`（无损）
- 跨格式：去掉 `-c copy`，走重编码

### 5.5 编码器映射

| 输出格式 | FFmpeg 编码器 | 说明 |
|---------|--------------|------|
| mp3 | `-c:a libmp3lame` | 默认 MP3 编码器 |
| wav | `-c:a pcm_s16le` | 16-bit PCM |
| aac | `-c:a aac` | 内置 AAC 编码器 |
| m4a | `-c:a aac` | AAC 容器 |
| flac | `-c:a flac` | 无损压缩 |
| ogg | `-c:a libvorbis` | Vorbis 编码器 |

## 6. 组件设计

### 6.1 AudioDropZone

- 拖拽或点击选择音频文件
- 支持 .mp3、.wav、.aac、.m4a、.flac、.ogg
- 选择后调用 `setAudioFile()`，触发 FFprobe 元数据读取

### 6.2 AudioMetadata

- 5 列信息卡片：时长 / 格式 / 比特率 / 采样率 / 声道
- 数据来自 store 中的 `audioInfo`

### 6.3 AudioWaveform

- 使用 wavesurfer.js 渲染波形
- 支持可拖拽的区域选择（裁剪时用）
- 播放 / 停止控制
- 底部显示时间轴和选中范围

### 6.4 AudioConverter

- 下拉选择目标格式
- 点击转换 → 弹出"另存为"对话框 → 执行 FFmpeg

### 6.5 AudioCompressor

- 预设选项：高质量 / 标准压缩 / 强力压缩 / 自定义比特率
- 高质量：256kbps，标准：128kbps，强力：64kbps
- 自定义比特率：64 / 128 / 192 / 256 / 320 kbps
- 点击压缩 → 弹出"另存为"对话框 → 执行 FFmpeg

### 6.6 AudioTrimmer

- 从波形区域获取选中时间范围，也支持手动输入
- 校验：开始 ≥ 0，结束 ≤ 时长，开始 < 结束
- 点击裁剪 → 弹出"另存为"对话框 → 执行 FFmpeg

## 7. 处理流程与结果展示

### 7.1 流程

```
用户配置参数 → 弹出"另存为"对话框（tauri-plugin-dialog） → 用户选输出路径 → 执行 FFmpeg → 展示结果
```

### 7.2 结果展示

处理完成后展示对比面板：

| 字段 | 示例 |
|------|------|
| 文件名 | example.mp3 → example.wav |
| 格式 | MP3 → WAV |
| 文件大小 | 3.2MB → 8.7MB |
| 比特率 | 128kbps → 1411kbps |
| 采样率 | 44100Hz → 44100Hz |
| 时长 | 03:25 |
| 状态 | 成功 / 失败 |

提供「打开文件所在目录」按钮（使用 tauri-plugin-opener）。

## 8. 异常处理

| 场景 | 处理方式 |
|------|---------|
| 文件格式不支持 | 加载时 Ant Design Message 提示"不支持的音频格式" |
| 文件损坏/无法读取 | FFprobe 解析失败，提示"无法读取音频信息，文件可能已损坏" |
| 裁剪时间不合法 | 提交前校验：开始 < 结束、开始 ≥ 0、结束 ≤ 时长 |
| 处理失败 | FFmpeg 非 0 退出码，展示 stderr 中的错误信息 |
| 输出路径已存在 | FFmpeg `-y` 覆盖（和视频分割一致） |

## 9. App.tsx 改造

- 现有视频分割的全部逻辑搬到 `pages/video/index.tsx`
- `App.tsx` 变为纯容器：顶部标签栏 + 条件渲染页面
- 默认 `activeTab = 'video'`

```typescript
function App() {
  const { activeTab, setActiveTab } = useAppStore()
  return (
    <Layout>
      <Header>
        <span>MediaKit</span>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="视频分割" key="video" />
          <TabPane tab="音频处理" key="audio" />
          <TabPane tab="图片处理" key="image" disabled />
        </Tabs>
      </Header>
      <Content>
        {activeTab === 'video' && <VideoPage />}
        {activeTab === 'audio' && <AudioPage />}
      </Content>
    </Layout>
  )
}
```

## 10. 依赖变更

### 新增依赖

| 包 | 用途 |
|----|------|
| wavesurfer.js | 音频波形可视化与区域选择 |

### Sidecar 变更

- `tauri.conf.json` 的 `externalBin` 新增 `binaries/ffprobe`
- `src-tauri/binaries/` 下需放置对应平台的 ffprobe 二进制

### UI 语言

- 全中文 UI，和现有视频分割保持一致

## 11. MVP 范围

第一版只做：

- 单文件上传（拖拽 + 点击）
- 元数据读取（FFprobe）
- 格式转换（6 种格式互转）
- 音频压缩（预设 + 自定义比特率）
- 音频裁剪（波形可视化 + 手动输入）
- 处理结果下载（另存为对话框）
- 处理前后信息对比
