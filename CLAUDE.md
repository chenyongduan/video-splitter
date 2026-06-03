# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**视频分割工具 (Video Splitter)** — a desktop app built with Tauri v2 + React 19 for splitting video files into segments using FFmpeg. The UI is entirely in Chinese (Simplified).

## Development Commands

```bash
# Frontend dev server (port 1420)
pnpm dev

# Full app with Tauri window
pnpm tauri dev

# Build production app
pnpm tauri build

# Type-check only
pnpm build

# Install frontend deps
pnpm install
```

No test or lint commands are currently configured.

## Architecture

### Thin Rust Backend, Fat Frontend

The Rust backend (`src-tauri/src/lib.rs`) registers four Tauri plugins and has **zero custom commands**. All application logic lives in the React frontend:

- **FFmpeg invocation** — done from frontend via `Command.sidecar("ffmpeg")` from `@tauri-apps/plugin-shell`. No Rust-side FFmpeg wrapping.
- **State** — single Zustand store at `src/store/segmentStore.ts`.
- **File dialogs** — `@tauri-apps/plugin-dialog` directly from frontend.

### FFmpeg Sidecar

FFmpeg binary lives at `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` and is declared as a sidecar in `tauri.conf.json` (`externalBin`). The frontend utility `src/utils/ffmpeg.ts` handles all sidecar command construction and stdout parsing for video info extraction and segment splitting.

### Frontend Structure

- `src/App.tsx` — main component, single-page (no router). Views toggle based on `isVideoLoaded`.
- `src/components/VideoPlayer.tsx` — HTML5 video player using `convertFileSrc()` (Tauri asset protocol).
- `src/components/SegmentTable.tsx` + `SegmentEditor.tsx` — Ant Design table with inline time editors.
- `src/components/ProgressDialog.tsx` — circular progress modal shown during split.
- `src/utils/format.ts` — time formatting (seconds ↔ HH:MM:SS.mmm).
- `src/types/index.ts` — `VideoInfo`, `Segment`, `SplitProgress` types.

### Tauri Plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-shell` | Run FFmpeg sidecar binary |
| `tauri-plugin-fs` | Create output directories |
| `tauri-plugin-dialog` | File open/save dialogs |
| `tauri-plugin-opener` | Open URLs/files in default app |

Permissions are defined in `src-tauri/capabilities/default.json`.

### Key Dependencies

- **Frontend:** React 19, Ant Design 6, Zustand 5, Vite 7
- **Backend:** Tauri v2 with `protocol-asset` feature, serde

## Design Docs

Architecture decisions are documented in `docs/superpowers/specs/`.
