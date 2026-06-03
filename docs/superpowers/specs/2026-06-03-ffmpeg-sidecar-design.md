# FFmpeg Sidecar 集成设计

## 概述

将 FFmpeg 作为 Tauri 2.0 Sidecar Binary 打包到应用中，运行时通过 Tauri Shell Plugin 的 `Command.sidecar()` 调用。不依赖用户本地安装的 FFmpeg、系统 PATH 或网络下载。

## 架构变更

```
Before (当前)                          After (目标)
┌───────────┐   invoke    ┌─────────┐  std::process  ┌────────┐
│  App.tsx  │ ──────────► │ Rust    │ ─────────────► │ System │
│  (React)  │ ◄────────── │ Backend │ ◄───────────── │ FFmpeg │
└───────────┘   result    └─────────┘                └────────┘

┌───────────┐  sidecar   ┌─────────────┐
│  App.tsx  │ ─────────► │ Bundled     │
│  (React)  │ ◄───────── │ FFmpeg      │
└───────────┘  result    └─────────────┘
     │
  calls API
     │
  ┌──┴──────────┐
  │ ffmpeg.ts   │  ← 封装所有 sidecar 调用 + 输出解析
  └─────────────┘
```

核心原则：所有 FFmpeg 调用统一通过 `Command.sidecar()` 从前端发起，禁止 `exec("ffmpeg")` / `spawn("ffmpeg")` 等系统依赖方式。

## 方案选择

**选定方案 B：FFmpeg 工具模块 + 前端 Sidecar**

创建独立的 `src/utils/ffmpeg.ts` 模块封装所有 Sidecar 调用和输出解析。组件只调用高层 API（`getVideoInfo`、`splitVideo`），不直接操作 sidecar。

优势：关注点分离、可测试、易维护。

## 文件变更清单

| 文件 | 操作 |
|---|---|
| `src-tauri/tauri.conf.json` | 修改 — 添加 `externalBin: ["binaries/ffmpeg"]` |
| `src-tauri/Cargo.toml` | 修改 — 添加 `tauri-plugin-shell = "2"` |
| `src-tauri/capabilities/default.json` | 修改 — 添加 `shell:allow-sidecar` 权限 |
| `src-tauri/src/lib.rs` | 修改 — 注册 shell 插件，移除自定义命令 |
| `src-tauri/src/commands/ffprobe.rs` | 删除 |
| `src-tauri/src/commands/split.rs` | 删除 |
| `src-tauri/src/commands/mod.rs` | 删除 |
| `src/utils/ffmpeg.ts` | 新建 — FFmpeg sidecar 调用封装 |
| `src/App.tsx` | 修改 — 用 ffmpeg.ts 替换 invoke 调用和事件监听 |
| `src/store/segmentStore.ts` | 修改 — 调整 split 进度来源（事件 → 回调） |
| `package.json` | 修改 — 添加 `@tauri-apps/plugin-shell` 依赖 |

## `src/utils/ffmpeg.ts` 模块设计

### 导出接口

```typescript
interface VideoInfo {
  duration: number;  // 秒
  width: number;
  height: number;
  fps: number;
}

type ProgressCallback = (current: number, total: number, percent: number) => void;

export async function getVideoInfo(filePath: string): Promise<VideoInfo>;
export async function splitVideo(
  inputPath: string,
  segments: Segment[],
  onProgress?: ProgressCallback
): Promise<string>;  // 返回输出目录路径
```

### getVideoInfo 实现细节

调用 `Command.sidecar("binaries/ffmpeg", ["-i", filePath])`，解析 stderr：

- `Duration: HH:MM:SS.ms` → 正则提取，转换为秒
- `Stream #0:0: Video ... 1920x1080` → 正则提取分辨率
- `Stream #0:0: Video ... 24000/1001` → 正则提取 fps，支持分数格式（如 `24000/1001`）

将现有 Rust `ffprobe.rs` 中的解析逻辑忠实移植到 TypeScript。

### splitVideo 实现细节

遍历 segments 数组，逐个调用：

```
ffmpeg -y -ss <start> -to <end> -i <input> -c copy <output>
```

- 使用 `-c copy` 实现无损流复制（不重新编码）
- 输出目录：`<input_dir>/<filename>_segments/`
- 每个 segment 完成后调用 `onProgress(current, total, percent)`
- 全部完成后返回输出目录路径

### 错误处理

sidecar 调用失败时抛出包含 ffmpeg stderr 内容的错误，前端可展示具体错误信息给用户。

## Tauri 配置变更

### tauri.conf.json

在 `bundle` 中添加：

```json
{
  "bundle": {
    "externalBin": [
      "binaries/ffmpeg"
    ]
  }
}
```

构建时 Tauri 自动根据 target triple 选择对应二进制：
- Windows: `ffmpeg-x86_64-pc-windows-msvc.exe`
- macOS Intel: `ffmpeg-x86_64-apple-darwin`
- macOS Apple Silicon: `ffmpeg-aarch64-apple-darwin`

### Cargo.toml

添加依赖：

```toml
[dependencies]
tauri-plugin-shell = "2"
```

### capabilities/default.json

```json
{
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "dialog:allow-open",
    "shell:allow-sidecar"
  ]
}
```

### lib.rs

精简为仅注册插件，移除自定义命令：

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 前端改动

### App.tsx

```typescript
// Before
import { invoke } from "@tauri-apps/api/core";
const info = await invoke<VideoInfo>("get_video_info", { path });
await invoke("split_video", { inputPath, segments });

// After
import { getVideoInfo, splitVideo } from "./utils/ffmpeg";
const info = await getVideoInfo(filePath);
const outputDir = await splitVideo(inputPath, segments, (current, total, percent) => {
  setProgress({ current, total, percent });
});
```

- 移除 `listen("split-progress", ...)` 事件监听
- 进度改为通过 `splitVideo` 的回调参数更新
- 拖拽文件后的信息获取改用 `getVideoInfo`

### segmentStore.ts

`SplitProgress` 接口保持不变。`setProgress` action 保持不变。仅调用来源从 Tauri 事件变为函数回调。

## FFmpeg 二进制文件管理

### 目录结构

```
src-tauri/binaries/
├── .gitkeep
├── ffmpeg-x86_64-pc-windows-msvc.exe
├── ffmpeg-x86_64-apple-darwin
└── ffmpeg-aarch64-apple-darwin
```

### 获取方式

- Windows: 从 [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) 下载 ffmpeg release build
- macOS: 从 [evermeet.cx](https://evermeet.cx/ffmpeg/) 下载对应架构的 ffmpeg

下载后重命名为上述文件名放入 `binaries/` 目录。

### Git 忽略

现有 `.gitignore` 已包含 `src-tauri/binaries/ffmpeg*` 和 `src-tauri/binaries/*.exe` 规则，二进制文件不会被提交到 git。

## 依赖安装

```bash
# 前端
pnpm add @tauri-apps/plugin-shell

# Tauri 侧（自动修改 Cargo.toml 和 capabilities）
pnpm tauri add shell
```

## 约束

- 禁止依赖用户本地安装的 FFmpeg
- 禁止依赖系统 PATH 环境变量
- 禁止运行时网络下载 FFmpeg
- 必须使用 `Command.sidecar()` 调用内置 FFmpeg
- 禁止使用 `exec("ffmpeg ...")` 或 `spawn("ffmpeg ...")`
