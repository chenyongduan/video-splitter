import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ToolDefinition } from "./aiClient";

const KID_BASE = "https://gate.97kid.com/a";
const KID_REFERER = "https://static-app.97kid.com/";
const KID_TOKEN_KEY = "mediakit_97kid_token";

/* ----------------------------- Token 持久化 ----------------------------- */

export function getKidToken(): string {
  return localStorage.getItem(KID_TOKEN_KEY)?.trim() ?? "";
}

export function setKidToken(value: string): void {
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(KID_TOKEN_KEY, trimmed);
  } else {
    localStorage.removeItem(KID_TOKEN_KEY);
  }
}

/* ------------------------------- 请求工具 ------------------------------- */

const cacheBuster = () => `__t__=${Date.now()}`;

async function kidGet(pathAndQuery: string): Promise<unknown> {
  const token = getKidToken();
  if (!token) {
    throw new Error("请先在设置中配置 97kid Token");
  }

  const response = await tauriFetch(`${KID_BASE}${pathAndQuery}`, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${token}`,
      referer: KID_REFERER,
    },
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message || `请求失败: ${response.status}`);
  }

  return data;
}

/* ----------------------------- 底层 fetch 函数 ---------------------------- */

export async function fetchRoom(roomId: number): Promise<unknown> {
  return kidGet(`/rooms/${roomId}?${cacheBuster()}`);
}

export async function fetchBusinessEntitiesAndMisc(): Promise<unknown> {
  return kidGet(`/businessEntitiesAndMisc?${cacheBuster()}`);
}

export async function fetchStudents(query: string): Promise<unknown> {
  return kidGet(`/students?${cacheBuster()}&searchText=${encodeURIComponent(query)}&page=1&pageSize=10&country=0`);
}

export async function fetchStudentAppointments(studentId: number): Promise<unknown> {
  return kidGet(`/schools/students/appointments?${cacheBuster()}&studentId=${studentId}&page=1&pageSize=20`);
}

export async function fetchDeviceInfo(
  roomId: number,
  role: "teacher" | "student",
  userId: number
): Promise<unknown> {
  return kidGet(`/deviceInfo/rooms/${roomId}/device?${cacheBuster()}&role=${role}&userId=${userId}`);
}

export async function fetchTeacherAppointments(teacherId: number, appId?: number): Promise<unknown> {
  const appIdParam = appId != null ? `&appId=${appId}` : "";
  return kidGet(`/teacherAppointments?${cacheBuster()}&teacherId=${teacherId}${appIdParam}&page=1&pageSize=20`);
}

/* --------------------------- 声明式工具注册表 --------------------------- */

/** 一个 97kid 接口 = 一条自包含条目。新增接口只需追加一条，无 switch。 */
export interface KidTool {
  /** 进 LLM */
  name: string;
  /** 进 LLM */
  description: string;
  /** 进 LLM（JSON Schema，用于提参） */
  params: object;
  /** 前端实际请求 */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  /** 回灌 LLM 的裁剪版（省 token）。完整 result 仅用于渲染，不进 LLM。 */
  summarizeForModel?: (result: unknown) => unknown;
}

type AnyObj = Record<string, any>;

const asObj = (value: unknown): AnyObj => (value && typeof value === "object" ? (value as AnyObj) : {});

export const KID_TOOLS: KidTool[] = [
  {
    name: "query_room",
    description: "根据房间 id 查询房间信息（学生数、状态、课程、时间、teacherId、skynetIp 等）。",
    params: {
      type: "object",
      properties: { roomId: { type: "number", description: "房间 id，例如 52351813" } },
      required: ["roomId"],
    },
    execute: (args) => fetchRoom(Number(args.roomId)),
    summarizeForModel: (result) => {
      const r = asObj(result);
      const schedule = asObj(r.schedule);
      const course = asObj(schedule.course);
      return {
        id: r.id,
        status: r.status,
        studentCount: r.studentCount,
        maxStudentCount: r.maxStudentCount,
        teacherId: r.teacherId,
        skynetIp: r.skynetIp,
        courseName: course.name,
        beginAt: schedule.beginAt,
        endAt: schedule.endAt,
        roomEndAt: r.roomEndAt,
      };
    },
  },
  {
    name: "list_misc",
    description: "查询公共枚举：业务(businessEntities)、班型(roomTypes)、地区(locations)、教师语言(teacherLanguageDetails)、应用(apps)、课时时长(roomDurations)。",
    params: { type: "object", properties: {} },
    execute: () => fetchBusinessEntitiesAndMisc(),
    summarizeForModel: (result) => {
      const r = asObj(result);
      const compress = (arr: unknown, labelKey = "nameCN", idKey = "id"): Record<string, unknown> => {
        const list = Array.isArray(arr) ? arr : [];
        const out: Record<string, unknown> = {};
        for (const item of list) {
          const o = asObj(item);
          out[String(o[idKey])] = o[labelKey] ?? o.name ?? o.id;
        }
        return out;
      };
      return {
        businessEntities: compress(r.businessEntities),
        roomTypes: compress(r.roomTypes),
        locations: compress(r.locations),
        teacherLanguageDetails: compress(r.teacherLanguageDetails, "name", "key"),
        apps: compress(r.apps),
        roomDurations: compress(r.roomDurations),
      };
    },
  },
  {
    name: "search_student",
    description: "按学生 id、昵称或手机号搜索学生。返回学生列表（含 id），可用于后续查询学生预约。",
    params: {
      type: "object",
      properties: { query: { type: "string", description: "学生 id、昵称或手机号，例如 3244918" } },
      required: ["query"],
    },
    execute: (args) => fetchStudents(String(args.query ?? "")),
    summarizeForModel: (result) => {
      const r = asObj(result);
      return {
        total: r.total,
        result: (Array.isArray(r.result) ? r.result : []).map((s) => {
          const o = asObj(s);
          return {
            id: o.id,
            nickname: o.nickname,
            localNickname: o.localNickname,
            mobileSuffix: o.mobileSuffix,
            status: o.status,
          };
        }),
      };
    },
  },
  {
    name: "list_student_appointments",
    description: "查询某学生的预约/上课记录列表（含已完成）。需先通过 search_student 拿到 studentId。",
    params: {
      type: "object",
      properties: { studentId: { type: "number", description: "学生 id" } },
      required: ["studentId"],
    },
    execute: (args) => fetchStudentAppointments(Number(args.studentId)),
    summarizeForModel: (result) => {
      const r = asObj(result);
      return {
        total: r.total,
        result: (Array.isArray(r.result) ? r.result : []).map((a) => {
          const o = asObj(a);
          const sch = asObj(o.schedule);
          return {
            id: o.id,
            status: o.status,
            beginAt: sch.beginAt,
            endAt: sch.endAt,
            roomTypeV2Name: sch.roomTypeV2Name,
            courseId: sch.courseId,
          };
        }),
      };
    },
  },
  {
    name: "query_device",
    description: "查询某房间内老师或学生的上课设备信息（平台、系统、客户端版本等）。role=teacher 时 userId 为 teacherId，role=student 时为 studentId。",
    params: {
      type: "object",
      properties: {
        roomId: { type: "number", description: "房间 id" },
        role: { type: "string", enum: ["teacher", "student"], description: "角色：老师 teacher、学生 student" },
        userId: { type: "number", description: "对应用户 id（teacherId 或 studentId）" },
      },
      required: ["roomId", "role", "userId"],
    },
    execute: (args) =>
      fetchDeviceInfo(
        Number(args.roomId),
        args.role === "student" ? "student" : "teacher",
        Number(args.userId)
      ),
    summarizeForModel: (result) => {
      const arr = Array.isArray(result) ? result : [];
      return arr.map((d) => {
        const o = asObj(d);
        return {
          platform: o.platform,
          os: o.os,
          model: o.model,
          appVersion: o.appVersion,
          appSubVersion: o.appSubVersion,
          createdAt: o.createdAt,
        };
      });
    },
  },
  {
    name: "list_teacher_appointments",
    description: "查询老师的预约/排课列表。appId 可选，用于按应用过滤。",
    params: {
      type: "object",
      properties: {
        teacherId: { type: "number", description: "老师 id" },
        appId: { type: "number", description: "可选，按应用过滤；不确定则不传" },
      },
      required: ["teacherId"],
    },
    execute: (args) => {
      const teacherId = Number(args.teacherId);
      const appId = args.appId == null ? undefined : Number(args.appId);
      return fetchTeacherAppointments(teacherId, appId);
    },
    summarizeForModel: (result) => {
      const r = asObj(result);
      return {
        total: r.total,
        result: (Array.isArray(r.result) ? r.result : []).map((a) => {
          const o = asObj(a);
          const sch = asObj(o.schedule);
          const room = asObj(o.room);
          return {
            id: o.id,
            status: o.status,
            classTime: o.classTime,
            beginAt: sch.beginAt,
            endAt: sch.endAt,
            roomTypeV2Id: sch.roomTypeV2Id,
            courseId: sch.courseId,
            appId: sch.appId,
            studentCount: room.studentCount,
          };
        }),
      };
    },
  },
];

/** 生成发给 LLM 的 tool 定义（只含 name/description/params）。 */
export function getKidToolDefinitions(): ToolDefinition[] {
  return KID_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.params },
  }));
}

export function findKidTool(name: string): KidTool | undefined {
  return KID_TOOLS.find((t) => t.name === name);
}
