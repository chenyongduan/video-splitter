# ToolKit

一款基于 Tauri v2 + React 构建的多功能媒体处理桌面工具，支持视频分割和音频处理（格式转换、压缩、裁剪）。

## 功能特性

### 视频分割
- **视频加载** — 支持拖拽或点击选择 MP4、MOV、MKV、AVI、WebM 格式视频
- **信息展示** — 自动解析视频分辨率、时长、帧率等信息
- **区间编辑** — 可视化添加/编辑/删除分割区间，支持精确到秒的时间设置
- **区间预览** — 点击预览按钮可直接在播放器中回放选定区间
- **无损切割** — 使用 FFmpeg `-c copy` 模式，不重新编码，速度极快且无画质损失
- **进度反馈** — 切割过程中实时显示进度

### 音频处理
- **格式转换** — 支持 MP3、WAV、AAC、M4A、FLAC、OGG 六种格式互转
- **音频压缩** — 预设质量选项（高质量/标准/强力）+ 自定义比特率
- **音频裁剪** — 波形可视化拖拽选区 + 手动输入时间，精确裁剪
- **元数据读取** — 自动展示时长、格式、比特率、采样率、声道信息
- **结果对比** — 处理前后文件大小、比特率、采样率对比展示

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端 | React 19 + TypeScript + Vite 7 |
| UI 组件 | Ant Design 6 |
| 状态管理 | Zustand 5 |
| 波形可视化 | wavesurfer.js 7 |
| 媒体处理 | FFmpeg / FFprobe（sidecar 二进制） |
| 后端 | Rust（仅注册插件，无自定义命令） |

## 项目结构

```
├── src/                          # React 前端
│   ├── App.tsx                   # 标签页容器（视频/音频/图片）
│   ├── pages/
│   │   ├── video/                # 视频分割模块
│   │   │   ├── index.tsx         # 页面入口
│   │   │   ├── VideoPlayer.tsx   # HTML5 视频播放器
│   │   │   ├── SegmentTable.tsx  # 分割区间表格
│   │   │   ├── SegmentEditor.tsx # 区间时间编辑器
│   │   │   └── ProgressDialog.tsx# 切割进度弹窗
│   │   └── audio/                # 音频处理模块
│   │       ├── index.tsx         # 页面入口
│   │       ├── AudioDropZone.tsx # 音频文件拖拽区
│   │       ├── AudioWaveform.tsx # 波形可视化
│   │       ├── AudioMetadata.tsx # 音频信息卡片
│   │       ├── AudioConverter.tsx# 格式转换面板
│   │       ├── AudioCompressor.tsx# 音频压缩面板
│   │       └── AudioTrimmer.tsx  # 音频裁剪面板
│   ├── store/
│   │   └── segmentStore.ts       # Zustand 全局状态
│   ├── utils/
│   │   ├── ffmpeg.ts             # 视频 FFmpeg 命令
│   │   ├── audio.ts              # 音频 FFmpeg/FFprobe 命令
│   │   └── format.ts             # 时间格式化工具
│   └── types/
│       └── index.ts              # TypeScript 类型定义
├── src-tauri/                    # Rust 后端 (Tauri)
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   └── lib.rs                # 插件注册（shell, fs, dialog, opener）
│   ├── capabilities/
│   │   └── default.json          # 权限配置
│   ├── binaries/                 # Sidecar 二进制（需手动下载，见下方说明）
│   └── tauri.conf.json           # Tauri 应用配置
└── docs/
    └── superpowers/specs/        # 架构设计文档
```

## 开发

### 环境要求

- [Node.js](https://nodejs.org/)（推荐 LTS 版本）
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri v2 环境依赖](https://v2.tauri.app/start/prerequisites/)

### 安装与运行

```bash
# 安装前端依赖
pnpm install

# 下载 FFmpeg / FFprobe sidecar 二进制（详见下方说明）
# 将可执行文件放入 src-tauri/binaries/ 目录

# 启动开发模式（前端热更新 + Tauri 窗口）
pnpm tauri dev

# 构建生产版本
pnpm tauri build

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\mediakit.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
pnpm tauri build --bundles nsis
```

### FFmpeg / FFprobe Sidecar 配置

本应用通过 Tauri sidecar 机制调用 FFmpeg 和 FFprobe，需要手动下载二进制文件并放入 `src-tauri/binaries/` 目录。

**各平台下载地址：**

| 平台 | 下载源 |
|------|--------|
| **Windows x64** | [gyan.dev](https://www.gyan.dev/ffmpeg/builds/)（选择 `ffmpeg-release-essentials.zip`，内含 ffmpeg + ffprobe） |
| **macOS (Apple Silicon)** | 通过 Homebrew 安装后复制：`brew install ffmpeg`，然后从 `/opt/homebrew/bin/` 复制 ffmpeg 和 ffprobe |
| **macOS (Intel)** | [evermeet.cx](https://evermeet.cx/ffmpeg/)（分别下载 ffmpeg 和 ffprobe 的 zip/7z） |
| **Linux x64** | [johnvansickle.com](https://johnvansickle.com/ffmpeg/)（选择 `ffmpeg-release-amd64-static.tar.xz`，内含 ffmpeg + ffprobe） |

**文件命名规则：**

Tauri sidecar 要求文件名包含目标平台三元组。下载后需按以下格式重命名：

| 平台 | FFmpeg 文件名 | FFprobe 文件名 |
|------|--------------|----------------|
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe` | `ffprobe-x86_64-pc-windows-msvc.exe` |
| macOS (Apple Silicon) | `ffmpeg-aarch64-apple-darwin` | `ffprobe-aarch64-apple-darwin` |
| macOS (Intel) | `ffmpeg-x86_64-apple-darwin` | `ffprobe-x86_64-apple-darwin` |
| Linux x64 | `ffmpeg-x86_64-unknown-linux-gnu` | `ffprobe-x86_64-unknown-linux-gnu` |

将对应平台的 `ffmpeg`（或 `ffmpeg.exe`）和 `ffprobe`（或 `ffprobe.exe`）重命名后放入 `src-tauri/binaries/` 目录即可。

**macOS 额外步骤：** 下载的二进制可能被系统标记为隔离，需执行：
```bash
xattr -dr com.apple.quarantine src-tauri/binaries/ffmpeg-*
xattr -dr com.apple.quarantine src-tauri/binaries/ffprobe-*
```

### 仅前端开发

```bash
# 启动 Vite 开发服务器 (http://localhost:1420)
pnpm dev

# 类型检查
pnpm build
```

## 架构说明

应用采用 **"薄后端、厚前端"** 架构：

- **Rust 后端**仅注册 Tauri 插件（Shell、FS、Dialog、Opener），没有自定义命令
- **FFmpeg / FFprobe 调用**全部在前端通过 `@tauri-apps/plugin-shell` 的 `Command.sidecar()` 完成
- **应用状态**集中在 Zustand store 中管理，包含视频状态和音频状态
- **视频播放**使用 Tauri 的 asset protocol 将本地文件路径转换为可播放的 URL
- **音频波形**使用 wavesurfer.js 渲染，支持可拖拽区域选择

## 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

MIT
