export interface DeviceInfo {
  deviceType?: "pc" | "mobile";
  platform?: string;
  distro?: string;
  arch?: string;
  systemRelease?: string;
  cpu?: string;
  memory?: number;
  version?: string;
  subVersion?: string;
  manufacturer?: string;
  model?: string;
  modelCode?: string;
  os?: string;
  osVersion?: string;
  deviceId?: string;
  network?: string;
  battery?: string;
  freeDisk?: string;
  freeMemory?: string;
  screenSize?: string;
  gpu?: Array<{
    model?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface InitAnalyticInfo {
  version?: string;
  subVersion?: string;
}

export interface LogAnalysisResult {
  device: DeviceInfo | null;
  rooms: RoomInfo[];
  diagnostic: DiagnosticInfo;
}

export interface RoomInfo {
  lineNumber: number;
  roomId: string;
  startTime: unknown;
  endTime: unknown;
  originalEndTime: unknown;
  teacherNickname: string;
  teacherId: string;
  schoolId: string;
}

export interface DiagnosticInfo {
  skynetDisconnectCount: number;
  latencyCount: number;
  averageLatency: number | null;
}

const DEVICE_MARKERS = ["getDeviceInfo=="];
const MOBILE_DEVICE_MARKERS = ["deviceInfo=>", "deviceInfo==", "deviceInfo="];
const INIT_ANALYTIC_MARKERS = ["initAnalytic==", "initAnalytic=", "initAnalytic"];
const ROOM_MARKERS = ["getRoomInfo==", "getRoomInfo=", "roomInfo==", "roomInfo=", "getRoom==", "getRoom=", "room==", "room="];

export function analyzeLogText(text: string): LogAnalysisResult {
  const pcDeviceInfo = extractFirstJson<DeviceInfo>(text, DEVICE_MARKERS);
  const mobileDeviceInfo = extractMobileDeviceInfo(text);
  const initAnalyticInfo = extractFirstJson<InitAnalyticInfo>(text, INIT_ANALYTIC_MARKERS);
  const roomMatches = extractJsonMatches<Record<string, unknown>>(text, ROOM_MARKERS);

  return {
    device: mergeDeviceInfo(
      mobileDeviceInfo ?? (pcDeviceInfo ? { ...pcDeviceInfo, deviceType: "pc" } : null),
      initAnalyticInfo
    ),
    rooms: dedupeRoomsByRoomId(roomMatches.map((match) => normalizeRoomInfo(match.value, getLineNumber(text, match.markerIndex)))),
    diagnostic: analyzeDiagnostics(text),
  };
}

function extractMobileDeviceInfo(text: string): DeviceInfo | null {
  const rawValues = extractLineValues(text, MOBILE_DEVICE_MARKERS);
  const versionInfo = rawValues
    .map(parseDeviceVersionInfo)
    .find((info) => info.version || info.subVersion);

  for (const raw of rawValues) {
    const colonDeviceInfo = parseColonDeviceInfo(raw);
    if (colonDeviceInfo) return mergeDeviceInfo(colonDeviceInfo, versionInfo ?? null);

    const deviceIdIndex = raw.indexOf("-deviceId=");
    if (deviceIdIndex < 0) continue;

    const deviceParts = raw.slice(0, deviceIdIndex).split("-");
    if (deviceParts.length < 5) continue;

    const manufacturer = deviceParts[0];
    const osVersion = deviceParts[deviceParts.length - 1];
    const os = deviceParts[deviceParts.length - 2];
    const modelCode = deviceParts[deviceParts.length - 3];
    const model = deviceParts.slice(1, -3).join("-");
    const kv = parseDashKeyValuePairs(raw.slice(deviceIdIndex + 1));

    return mergeDeviceInfo({
      deviceType: "mobile",
      manufacturer,
      platform: os,
      model,
      modelCode,
      os,
      osVersion,
      deviceId: kv.deviceId,
      network: kv.net,
      battery: kv.battery,
      freeDisk: kv.freeDisk,
      freeMemory: kv.freeMemory,
      screenSize: kv.screenSize,
    }, versionInfo ?? null);
  }

  return null;
}

function parseDeviceVersionInfo(raw: string): InitAnalyticInfo {
  const fields = parseColonKeyValuePairs(raw, ["appVersion", "appSubVersion"]);
  return {
    version: fields.appVersion,
    subVersion: fields.appSubVersion,
  };
}

function parseColonDeviceInfo(raw: string): DeviceInfo | null {
  const fields = parseColonKeyValuePairs(raw, ["platform", "model", "deviceId", "osVersion"]);
  if (!fields.platform && !fields.model && !fields.deviceId && !fields.osVersion) return null;

  return {
    deviceType: "mobile",
    platform: fields.platform,
    os: fields.platform,
    model: fields.model,
    deviceId: fields.deviceId,
    osVersion: fields.osVersion,
  };
}

function parseColonKeyValuePairs(text: string, keys: string[]): Record<string, string> {
  const keyPattern = keys.join("|");
  const matcher = new RegExp(`(?:^|\\s)(${keyPattern}):\\s*(.*?)(?=\\s+(?:${keyPattern}):|$)`, "g");
  const result: Record<string, string> = {};

  for (const match of text.matchAll(matcher)) {
    result[match[1]] = match[2].trim();
  }

  return result;
}

function extractLineValues(text: string, markers: string[]): string[] {
  const values: string[] = [];

  for (const marker of markers) {
    let markerIndex = text.indexOf(marker);
    while (markerIndex >= 0) {
      const start = markerIndex + marker.length;
      const lineEnd = text.indexOf("\n", start);
      values.push(text.slice(start, lineEnd < 0 ? undefined : lineEnd).trim());

      if (lineEnd < 0) break;
      markerIndex = text.indexOf(marker, lineEnd + 1);
    }
  }

  return values;
}

function parseDashKeyValuePairs(text: string): Record<string, string> {
  return text.split("-").reduce<Record<string, string>>((result, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) return result;
    result[part.slice(0, separatorIndex)] = part.slice(separatorIndex + 1);
    return result;
  }, {});
}

function analyzeDiagnostics(text: string): DiagnosticInfo {
  const skynetDisconnectCount = text.match(/skynet is disconnect/g)?.length ?? 0;
  const latencies = [...text.matchAll(/latency=([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);

  return {
    skynetDisconnectCount,
    latencyCount: latencies.length,
    averageLatency: latencies.length > 0 ? totalLatency / latencies.length : null,
  };
}

function mergeDeviceInfo(deviceInfo: DeviceInfo | null, initAnalyticInfo: InitAnalyticInfo | null): DeviceInfo | null {
  if (!deviceInfo && !initAnalyticInfo) return null;

  return {
    ...(deviceInfo ?? {}),
    version: initAnalyticInfo?.version ?? deviceInfo?.version,
    subVersion: initAnalyticInfo?.subVersion ?? deviceInfo?.subVersion,
  };
}

function extractFirstJson<T>(text: string, markers: string[]): T | null {
  return extractFirstJsonMatch<T>(text, markers)?.value ?? null;
}

function extractFirstJsonMatch<T>(text: string, markers: string[]): { value: T; markerIndex: number } | null {
  for (const marker of markers) {
    const parsed = extractJsonAfterMarker<T>(text, marker, 0);
    if (parsed) return parsed;
  }
  return null;
}

function extractJsonMatches<T>(text: string, markers: string[]): Array<{ value: T; markerIndex: number }> {
  const matches: Array<{ value: T; markerIndex: number }> = [];
  const seenMarkerIndexes = new Set<number>();

  for (const marker of markers) {
    let fromIndex = 0;
    while (fromIndex < text.length) {
      const parsed = extractJsonAfterMarker<T>(text, marker, fromIndex);
      if (!parsed) break;

      if (!seenMarkerIndexes.has(parsed.markerIndex)) {
        matches.push(parsed);
        seenMarkerIndexes.add(parsed.markerIndex);
      }

      fromIndex = parsed.endIndex + 1;
    }
  }

  return matches.sort((a, b) => a.markerIndex - b.markerIndex);
}

function extractJsonAfterMarker<T>(
  text: string,
  marker: string,
  fromIndex: number
): { value: T; markerIndex: number; endIndex: number } | null {
  const markerIndex = text.indexOf(marker, fromIndex);
  if (markerIndex < 0) return null;

  const jsonStart = text.indexOf("{", markerIndex + marker.length);
  if (jsonStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = jsonStart; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = text.slice(jsonStart, i + 1);
        try {
          return {
            value: JSON.parse(jsonText) as T,
            markerIndex,
            endIndex: i,
          };
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function normalizeRoomInfo(room: Record<string, unknown>, lineNumber: number): RoomInfo {
  return {
    lineNumber,
    roomId: stringifyFirst(room, ["roomId", "id", "room.id", "room.roomId"]),
    startTime: firstValue(room, ["beginAt", "startTime", "startAt", "start_time", "beginTime", "begin_time", "room.beginAt", "room.startTime"]),
    endTime: firstValue(room, ["endAt", "endTime", "end_time", "room.endAt", "room.endTime"]),
    originalEndTime: firstValue(room, [
      "originalEndAt",
      "originEndAt",
      "originalEndTime",
      "originEndTime",
      "rawEndTime",
      "realEndTime",
      "original_end_at",
      "original_end_time",
      "room.originalEndAt",
      "room.originEndAt",
      "room.originalEndTime",
    ]),
    teacherNickname: stringifyFirst(room, [
      "teacherNickName",
      "teacherNickname",
      "teacherName",
      "nickName",
      "nickname",
      "teacher.nickName",
      "teacher.nickname",
      "teacher.name",
      "teacherInfo.nickName",
      "teacherInfo.nickname",
      "teacherInfo.name",
    ]),
    teacherId: stringifyFirst(room, ["teacherId", "teacher.id", "teacherInfo.id", "teacher.userId"]),
    schoolId: stringifyFirst(room, ["schoolId", "class.schoolId", "classInfo.schoolId", "room.schoolId"]),
  };
}

function dedupeRoomsByRoomId(rooms: RoomInfo[]): RoomInfo[] {
  const seenRoomIds = new Set<string>();

  return rooms.filter((room) => {
    if (!room.roomId) return true;
    if (seenRoomIds.has(room.roomId)) return false;
    seenRoomIds.add(room.roomId);
    return true;
  });
}

function stringifyFirst(source: Record<string, unknown>, paths: string[]): string {
  const value = firstValue(source, paths);
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function firstValue(source: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function getByPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function getLineNumber(text: string, index: number): number {
  let lineNumber = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === "\n") lineNumber += 1;
  }
  return lineNumber;
}
