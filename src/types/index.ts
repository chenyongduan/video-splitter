export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  filename: string;
}

export interface SplitProgress {
  current: number;
  total: number;
  percent: number;
}
