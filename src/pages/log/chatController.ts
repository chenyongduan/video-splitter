import { chatCompletion, type ChatMessage } from "./aiClient";
import { findKidTool, getKidToolDefinitions } from "./kidApi";

export interface ToolResultEntry {
  toolName: string;
  /** 完整原始响应——不进 LLM，仅用于控制层判断是否查到了数据。 */
  data: unknown;
}

export interface ChatTurnResult {
  content: string;
  toolResults: ToolResultEntry[];
}

interface RunOptions {
  includeLogContext: boolean;
  logText: string;
}

const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPT = [
  "你是久趣（97kid）课堂运维助手，用户会用中文提问房间、学生、老师、设备等信息。",
  "需要查询数据时调用对应工具：query_room / list_misc / search_student / list_student_appointments / list_student_products / query_product / list_student_bills / query_device / list_teacher_appointments。",
  "能从对话直接提取的参数（房间号、学生 id、产品 id 等）就直接提取；需要先查再查时可连续调用多个工具。",
  "工具返回的数据不会直接展示给用户，你需要用中文概括关键结论；明细较多时只列最重要的字段和异常点。",
  "通用日志分析问题正常作答即可。",
].join("\n");

function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * 跑一轮带工具的对话。完整工具响应只收集到 toolResults（用于控制层判断），
 * 回灌给模型的只是每个工具 summarizeForModel 裁剪后的最小数据（省 token）。
 */
export async function runChatWithTools(
  model: string,
  history: ChatMessage[],
  opts: RunOptions
): Promise<ChatTurnResult> {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (opts.includeLogContext) {
    messages.push({
      role: "user",
      content: `以下是当前要分析的完整日志内容，请结合日志回答后续问题：\n\n${opts.logText}`,
    });
  }
  messages.push(...history);

  const tools = getKidToolDefinitions();
  const toolResults: ToolResultEntry[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const assistant = await chatCompletion({
      model,
      messages,
      tools,
      toolChoice: isLastRound ? "none" : "auto",
    });
    messages.push(assistant);

    if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
      return { content: assistant.content ?? "", toolResults };
    }

    for (const call of assistant.tool_calls) {
      const tool = findKidTool(call.function.name);
      if (!tool) {
        messages.push({
          role: "tool",
          content: `未知工具: ${call.function.name}`,
          tool_call_id: call.id,
        });
        continue;
      }

      const args = safeParseArgs(call.function.arguments);
      try {
        const result = await tool.execute(args);
        const summary = tool.summarizeForModel ? tool.summarizeForModel(result) : result;
        messages.push({
          role: "tool",
          content: typeof summary === "string" ? summary : JSON.stringify(summary),
          tool_call_id: call.id,
        });
        toolResults.push({ toolName: tool.name, data: result });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        messages.push({
          role: "tool",
          content: `调用失败: ${reason}`,
          tool_call_id: call.id,
        });
      }
    }
  }

  return {
    content: "（工具调用次数已达上限，请尝试缩小问题范围）",
    toolResults,
  };
}
