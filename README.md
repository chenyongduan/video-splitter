# 视频分割工具 (Video Splitter)

一款基于 Tauri v2 + React 构建的桌面视频分割工具，通过内置 FFmpeg 实现无损视频片段切割。

## 功能特性

- **视频加载** — 支持拖拽或点击选择 MP4、MOV、MKV、AVI、WebM 格式视频
- **信息展示** — 自动解析视频分辨率、时长、帧率等信息
- **区间编辑** — 可视化添加/编辑/删除分割区间，支持精确到秒的时间设置
- **区间预览** — 点击预览按钮可直接在播放器中回放选定区间
- **无损切割** — 使用 FFmpeg `-c copy` 模式，不重新编码，速度极快且无画质损失
- **进度反馈** — 切割过程中实时显示进度

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端 | React 19 + TypeScript + Vite 7 |
| UI 组件 | Ant Design 6 |
| 状态管理 | Zustand 5 |
| 视频处理 | FFmpeg（sidecar 二进制） |
| 后端 | Rust（仅注册插件，无自定义命令） |

## 项目结构

```
├── src/                          # React 前端
│   ├── App.tsx                   # 主界面（拖拽加载 + 区间管理 + 切割）
│   ├── components/
│   │   ├── VideoPlayer.tsx       # HTML5 视频播放器
│   │   ├── SegmentTable.tsx      # 分割区间表格
│   │   ├── SegmentEditor.tsx     # 区间时间编辑器
│   │   └── ProgressDialog.tsx    # 切割进度弹窗
│   ├── store/
│   │   └── segmentStore.ts       # Zustand 全局状态
│   ├── utils/
│   │   ├── ffmpeg.ts             # FFmpeg sidecar 调用与输出解析
│   │   └── format.ts             # 时间格式化工具
│   └── types/
│       └── index.ts              # TypeScript 类型定义
├── src-tauri/                    # Rust 后端 (Tauri)
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   └── lib.rs                # 插件注册（shell, fs, dialog, opener）
│   ├── capabilities/
│   │   └── default.json          # 权限配置
│   ├── binaries/
│   │   └── ffmpeg-x86_64-pc-windows-msvc.exe  # FFmpeg sidecar
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

# 启动开发模式（前端热更新 + Tauri 窗口）
pnpm tauri dev

# 构建生产版本
pnpm tauri build
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
- **FFmpeg 调用**全部在前端通过 `@tauri-apps/plugin-shell` 的 `Command.sidecar()` 完成
- **应用状态**集中在 Zustand store 中管理，包含视频信息、分割区间和切割进度
- **视频播放**使用 Tauri 的 asset protocol 将本地文件路径转换为可播放的 URL

## 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

MIT
