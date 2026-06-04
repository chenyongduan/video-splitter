import { create } from "zustand";
import type {
  Segment,
  VideoInfo,
  SplitProgress,
  VideoFunctionTab,
  VideoProcessResult,
  AudioInfo,
  AudioProcessResult,
  ImageInfo,
  ImageProcessResult,
  AppTab,
} from "../types";

interface AppState {
  // Global tab state
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

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

  // Video processing state
  videoFunctionTab: VideoFunctionTab;
  isVideoProcessing: boolean;
  videoProcessResult: VideoProcessResult | null;

  // Video element ref (not reactive, used imperatively)
  videoElement: HTMLVideoElement | null;
  setVideoElement: (el: HTMLVideoElement | null) => void;

  // Audio state
  audioPath: string;
  audioFileName: string;
  audioInfo: AudioInfo | null;
  isAudioLoaded: boolean;
  audioFunctionTab: "convert" | "compress" | "trim";
  audioProcessResult: AudioProcessResult | null;
  isAudioProcessing: boolean;

  // Image state
  imagePath: string;
  imageFileName: string;
  imageInfo: ImageInfo | null;
  isImageLoaded: boolean;
  imageFunctionTab: "convert" | "compress" | "resize" | "crop" | "rotate";
  imageProcessResult: ImageProcessResult | null;
  isImageProcessing: boolean;
  imageRotation: number;
  imageFlipH: boolean;
  imageFlipV: boolean;

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

  // Video processing actions
  setVideoFunctionTab: (tab: VideoFunctionTab) => void;
  setVideoProcessing: (val: boolean) => void;
  setVideoProcessResult: (result: VideoProcessResult | null) => void;

  // Audio actions
  setAudioFunctionTab: (tab: string) => void;
  setAudioFile: (path: string, fileName: string, info: AudioInfo) => void;
  clearAudio: () => void;
  setAudioProcessing: (val: boolean) => void;
  setAudioProcessResult: (result: AudioProcessResult | null) => void;

  // Image actions
  setImageFile: (path: string, fileName: string, info: ImageInfo) => void;
  clearImage: () => void;
  setImageFunctionTab: (tab: "convert" | "compress" | "resize" | "crop" | "rotate") => void;
  setImageProcessing: (val: boolean) => void;
  setImageProcessResult: (result: ImageProcessResult | null) => void;
  setImageRotation: (val: number) => void;
  setImageFlipH: (val: boolean) => void;
  setImageFlipV: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Global
  activeTab: "video",
  setActiveTab: (tab) => set({ activeTab: tab }),

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

  // Video processing
  videoFunctionTab: "split",
  isVideoProcessing: false,
  videoProcessResult: null,

  // Video element
  videoElement: null,
  setVideoElement: (el) => set({ videoElement: el }),

  // Audio
  audioPath: "",
  audioFileName: "",
  audioInfo: null,
  isAudioLoaded: false,
  audioFunctionTab: "convert",
  audioProcessResult: null,
  isAudioProcessing: false,

  // Image
  imagePath: "",
  imageFileName: "",
  imageInfo: null,
  isImageLoaded: false,
  imageFunctionTab: "convert",
  imageProcessResult: null,
  isImageProcessing: false,
  imageRotation: 0,
  imageFlipH: false,
  imageFlipV: false,

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
      videoFunctionTab: "split",
      isVideoProcessing: false,
      videoProcessResult: null,
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
      videoFunctionTab: "split",
      isVideoProcessing: false,
      videoProcessResult: null,
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
    const prevHandler = (video as HTMLVideoElement & { _previewHandler?: () => void })
      ._previewHandler;
    if (prevHandler) {
      video.removeEventListener("timeupdate", prevHandler);
    }

    const handler = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.removeEventListener("timeupdate", handler);
        (
          video as HTMLVideoElement & { _previewHandler?: () => void }
        )._previewHandler = undefined;
      }
    };

    (video as HTMLVideoElement & { _previewHandler?: () => void })._previewHandler =
      handler;
    video.addEventListener("timeupdate", handler);

    video.currentTime = start;
    video.play();
  },

  // Split actions
  setSplitting: (val) => set({ isSplitting: val }),
  setProgress: (progress) => set({ progress }),
  setSplitResult: (result) => set({ splitResult: result }),

  // Video processing actions
  setVideoFunctionTab: (tab) => set({ videoFunctionTab: tab }),
  setVideoProcessing: (val) => set({ isVideoProcessing: val }),
  setVideoProcessResult: (result) => set({ videoProcessResult: result }),

  // Audio actions
  setAudioFunctionTab: (tab) =>
    set({ audioFunctionTab: tab as "convert" | "compress" | "trim" }),

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

  // Image actions
  setImageFile: (path, fileName, info) =>
    set({
      imagePath: path,
      imageFileName: fileName,
      imageInfo: info,
      isImageLoaded: true,
      imageProcessResult: null,
    }),

  clearImage: () =>
    set({
      imagePath: "",
      imageFileName: "",
      imageInfo: null,
      isImageLoaded: false,
      imageFunctionTab: "convert",
      imageProcessResult: null,
      isImageProcessing: false,
      imageRotation: 0,
      imageFlipH: false,
      imageFlipV: false,
    }),

  setImageFunctionTab: (tab) => set({ imageFunctionTab: tab }),
  setImageProcessing: (val) => set({ isImageProcessing: val }),
  setImageProcessResult: (result) => set({ imageProcessResult: result }),
  setImageRotation: (val) => set({ imageRotation: val }),
  setImageFlipH: (val) => set({ imageFlipH: val }),
  setImageFlipV: (val) => set({ imageFlipV: val }),
}));
