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
  ImageOutputSettings,
  IconInfo,
  IconExportResult,
  AppTab,
  VisibleLine,
  JsonValidationResult,
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
  imageCropRect: { x: number; y: number; w: number; h: number };
  imageCropEnabled: boolean;
  imageOutput: ImageOutputSettings;

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
  setImageCropRect: (rect: { x: number; y: number; w: number; h: number }) => void;
  setImageCropEnabled: (val: boolean) => void;
  setImageOutput: (patch: Partial<ImageOutputSettings>) => void;
  resetImageEdit: () => void;

  // Icon state
  iconPath: string;
  iconFileName: string;
  iconInfo: IconInfo | null;
  isIconLoaded: boolean;
  isIconProcessing: boolean;
  iconProcessResult: IconExportResult | null;
  iconCornerRadius: number;
  iconPadding: number;

  // Icon actions
  setIconFile: (path: string, fileName: string, info: IconInfo) => void;
  clearIcon: () => void;
  setIconProcessing: (val: boolean) => void;
  setIconProcessResult: (result: IconExportResult | null) => void;
  setIconCornerRadius: (val: number) => void;
  setIconPadding: (val: number) => void;

  // JSON state
  jsonPath: string | null;
  jsonFileName: string | null;
  isJsonLoaded: boolean;
  jsonTotalLines: number;
  jsonFetchedLines: VisibleLine[];
  jsonFetchStart: number;
  jsonValidationError: JsonValidationResult | null;
  jsonExpandStrings: boolean;

  // Log state
  logText: string;

  // JSON actions
  setJsonFile: (path: string, fileName: string, totalLines: number, firstPage: VisibleLine[]) => void;
  clearJson: () => void;
  setJsonLines: (totalLines: number, fetchedLines: VisibleLine[], fetchStart: number) => void;
  setJsonValidationError: (result: JsonValidationResult | null) => void;
  setJsonExpandStrings: (val: boolean) => void;

  // Log actions
  setLogText: (text: string) => void;
  clearLog: () => void;
}

const DEFAULT_IMAGE_OUTPUT: ImageOutputSettings = {
  format: "original",
  quality: 80,
  sizeMode: "auto",
  scalePercent: 100,
  width: 0,
  height: 0,
  lockAspectRatio: true,
};

/** 重置图片编辑状态（旋转/翻转/裁剪/裁剪开关），不清理文件信息 */
const resetImageEditState = () => ({
  imageRotation: 0,
  imageFlipH: false,
  imageFlipV: false,
  imageCropRect: { x: 0, y: 0, w: 0, h: 0 },
  imageCropEnabled: false,
  imageOutput: { ...DEFAULT_IMAGE_OUTPUT },
});

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
  imageCropRect: { x: 0, y: 0, w: 0, h: 0 },
  imageCropEnabled: false,
  imageOutput: { ...DEFAULT_IMAGE_OUTPUT },

  // Icon
  iconPath: "",
  iconFileName: "",
  iconInfo: null,
  isIconLoaded: false,
  isIconProcessing: false,
  iconProcessResult: null,
  iconCornerRadius: 0,
  iconPadding: 0,

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
      ...resetImageEditState(),
    }),

  clearImage: () =>
    set({
      imagePath: "",
      imageFileName: "",
      imageInfo: null,
      isImageLoaded: false,
      imageProcessResult: null,
      isImageProcessing: false,
      ...resetImageEditState(),
    }),

  setImageFunctionTab: (tab) => set({ imageFunctionTab: tab }),
  setImageProcessing: (val) => set({ isImageProcessing: val }),
  setImageProcessResult: (result) => set({ imageProcessResult: result }),
  setImageRotation: (val) => set({ imageRotation: val }),
  setImageFlipH: (val) => set({ imageFlipH: val }),
  setImageFlipV: (val) => set({ imageFlipV: val }),
  setImageCropRect: (rect) => set({ imageCropRect: rect }),
  setImageCropEnabled: (val) => set({ imageCropEnabled: val }),
  setImageOutput: (patch) =>
    set((s) => ({ imageOutput: { ...s.imageOutput, ...patch } })),
  resetImageEdit: () => set({ ...resetImageEditState() }),

  // Icon actions
  setIconFile: (path, fileName, info) =>
    set({
      iconPath: path,
      iconFileName: fileName,
      iconInfo: info,
      isIconLoaded: true,
      iconProcessResult: null,
    }),

  clearIcon: () =>
    set({
      iconPath: "",
      iconFileName: "",
      iconInfo: null,
      isIconLoaded: false,
      isIconProcessing: false,
      iconProcessResult: null,
      iconCornerRadius: 0,
      iconPadding: 0,
    }),

  setIconProcessing: (val) => set({ isIconProcessing: val }),
  setIconProcessResult: (result) => set({ iconProcessResult: result }),
  setIconCornerRadius: (val) => set({ iconCornerRadius: val }),
  setIconPadding: (val) => set({ iconPadding: val }),

  // JSON
  jsonPath: null,
  jsonFileName: null,
  isJsonLoaded: false,
  jsonTotalLines: 0,
  jsonFetchedLines: [],
  jsonFetchStart: 0,
  jsonValidationError: null,
  jsonExpandStrings: true,

  // JSON actions
  setJsonFile: (path, fileName, totalLines, firstPage) => {
    set({
      jsonPath: path,
      jsonFileName: fileName,
      isJsonLoaded: true,
      jsonTotalLines: totalLines,
      jsonFetchedLines: firstPage,
      jsonFetchStart: 0,
      jsonValidationError: null,
    });
  },

  clearJson: () => {
    set({
      jsonPath: null,
      jsonFileName: null,
      isJsonLoaded: false,
      jsonTotalLines: 0,
      jsonFetchedLines: [],
      jsonFetchStart: 0,
      jsonValidationError: null,
    });
  },

  setJsonLines: (totalLines, fetchedLines, fetchStart) => {
    set({
      jsonTotalLines: totalLines,
      jsonFetchedLines: fetchedLines,
      jsonFetchStart: fetchStart,
    });
  },

  setJsonValidationError: (result) => {
    set({ jsonValidationError: result });
  },

  setJsonExpandStrings: (val) => {
    set({ jsonExpandStrings: val });
  },

  // Log
  logText: "",

  setLogText: (text) => {
    set({ logText: text });
  },

  clearLog: () => {
    set({ logText: "" });
  },
}));
