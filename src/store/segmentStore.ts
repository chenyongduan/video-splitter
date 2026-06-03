import { create } from "zustand";
import type { Segment, VideoInfo, SplitProgress } from "../types";

interface AppState {
  // Video state
  videoPath: string;
  videoInfo: VideoInfo | null;
  videoFileName: string;
  isVideoLoaded: boolean;

  // Segment state
  segments: Segment[];

  // Split state
  isSplitting: boolean;
  progress: SplitProgress | null;
  splitResult: string | null;

  // Video element ref (not reactive, used imperatively)
  videoElement: HTMLVideoElement | null;
  setVideoElement: (el: HTMLVideoElement | null) => void;

  // Video actions
  setVideo: (path: string, fileName: string, info: VideoInfo) => void;
  clearVideo: () => void;

  // Segment actions
  addSegment: (start: number, end: number) => void;
  removeSegment: (id: string) => void;
  updateSegment: (id: string, updates: Partial<Segment>) => void;
  clearSegments: () => void;

  // Preview: seek to start and play until end
  previewSegment: (start: number, end: number) => void;

  // Split actions
  setSplitting: (val: boolean) => void;
  setProgress: (progress: SplitProgress | null) => void;
  setSplitResult: (result: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Video
  videoPath: "",
  videoInfo: null,
  videoFileName: "",
  isVideoLoaded: false,

  // Segments
  segments: [],

  // Split
  isSplitting: false,
  progress: null,
  splitResult: null,

  // Video element
  videoElement: null,
  setVideoElement: (el) => set({ videoElement: el }),

  // Video actions
  setVideo: (path, fileName, info) =>
    set({
      videoPath: path,
      videoFileName: fileName,
      videoInfo: info,
      isVideoLoaded: true,
      segments: [],
      progress: null,
      splitResult: null,
    }),

  clearVideo: () =>
    set({
      videoPath: "",
      videoFileName: "",
      videoInfo: null,
      isVideoLoaded: false,
      segments: [],
      progress: null,
      splitResult: null,
    }),

  // Segment actions
  addSegment: (start, end) => {
    const id = crypto.randomUUID();
    const filename = `${Math.round(start)}-${Math.round(end)}.mp4`;
    const seg: Segment = { id, start, end, filename };
    set((state) => ({
      segments: [...state.segments, seg].sort((a, b) => a.start - b.start),
    }));
  },

  removeSegment: (id) =>
    set((state) => ({
      segments: state.segments.filter((s) => s.id !== id),
    })),

  updateSegment: (id, updates) =>
    set((state) => ({
      segments: state.segments
        .map((s) => (s.id === id ? { ...s, ...updates } : s))
        .sort((a, b) => a.start - b.start),
    })),

  clearSegments: () => set({ segments: [] }),

  // Preview: seek to start, play, auto-pause at end
  previewSegment: (start, end) => {
    const video = get().videoElement;
    if (!video) return;

    // Remove any previous preview listener
    const prevHandler = (video as HTMLVideoElement & { _previewHandler?: () => void })._previewHandler;
    if (prevHandler) {
      video.removeEventListener("timeupdate", prevHandler);
    }

    const handler = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.removeEventListener("timeupdate", handler);
        (video as HTMLVideoElement & { _previewHandler?: () => void })._previewHandler = undefined;
      }
    };

    (video as HTMLVideoElement & { _previewHandler?: () => void })._previewHandler = handler;
    video.addEventListener("timeupdate", handler);

    video.currentTime = start;
    video.play();
  },

  // Split actions
  setSplitting: (val) => set({ isSplitting: val }),
  setProgress: (progress) => set({ progress }),
  setSplitResult: (result) => set({ splitResult: result }),
}));
