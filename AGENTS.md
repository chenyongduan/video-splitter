# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**ToolKit** — a multi-purpose media processing desktop app built with Tauri v2 + React 19. Currently supports video splitting and audio processing (format conversion, compression, trimming). The UI is entirely in Chinese (Simplified).

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

- **FFmpeg/FFprobe invocation** — done from frontend via `Command.sidecar()` from `@tauri-apps/plugin-shell`. No Rust-side wrapping.
- **State** — single Zustand store at `src/store/segmentStore.ts`.
- **File dialogs** — `@tauri-apps/plugin-dialog` directly from frontend.

### FFmpeg/FFprobe Sidecars

FFmpeg and FFprobe binaries live in `src-tauri/binaries/` (gitignored, must be manually downloaded). Declared as sidecars in `tauri.conf.json` (`externalBin`). See README for download instructions.

- `src/utils/ffmpeg.ts` — video info extraction and segment splitting
- `src/utils/audio.ts` — audio metadata (FFprobe), format conversion, compression, trimming

### Frontend Structure

```
src/
├── App.tsx              — Tab container (video / audio / image)
├── pages/
│   ├── video/           — Video splitting page
│   │   ├── index.tsx     — Page entry
│   │   ├── VideoPlayer.tsx
│   │   ├── SegmentTable.tsx
│   │   ├── SegmentEditor.tsx
│   │   └── ProgressDialog.tsx
│   └── audio/           — Audio processing page
│       ├── index.tsx     — Page entry
│       ├── AudioDropZone.tsx
│       ├── AudioWaveform.tsx   (wavesurfer.js)
│       ├── AudioMetadata.tsx
│       ├── AudioConverter.tsx
│       ├── AudioCompressor.tsx
│       └── AudioTrimmer.tsx
├── store/segmentStore.ts — Single Zustand store (video + audio state)
├── utils/
│   ├── ffmpeg.ts         — Video FFmpeg commands
│   ├── audio.ts          — Audio FFmpeg/FFprobe commands
│   └── format.ts         — Time formatting utilities
└── types/index.ts        — All TypeScript types
```

### Tauri Plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-shell` | Run FFmpeg/FFprobe sidecar binaries |
| `tauri-plugin-fs` | Create output directories |
| `tauri-plugin-dialog` | File open/save dialogs |
| `tauri-plugin-opener` | Open URLs/files in default app |

Permissions are defined in `src-tauri/capabilities/default.json`.

### Key Dependencies

- **Frontend:** React 19, Ant Design 6, Zustand 5, Vite 7, wavesurfer.js 7
- **Backend:** Tauri v2 with `protocol-asset` feature, serde

## Design Docs

Architecture decisions are documented in `docs/superpowers/specs/`.
