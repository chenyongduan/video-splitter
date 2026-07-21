import { chatCompletion, type ChatMessage } from "./aiClient";
import { getAiAnalystSystemPrompt, type AiAnalystRole } from "./aiRoles";
import { findKidTool, getKidToolDefinitions, KidTokenExpiredError } from "./kidApi";

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
  analystRole: AiAnalystRole;
  includeLogContext: boolean;
  logText: string;
  signal?: AbortSignal;
}

const MAX_TOOL_ROUNDS = 5;

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
  const messages: ChatMessage[] = [
    { role: "system", content: getAiAnalystSystemPrompt(opts.analystRole) },
  ];
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
      signal: opts.signal,
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
        const result = await tool.execute(args, opts.signal);
        const summary = tool.summarizeForModel ? tool.summarizeForModel(result) : result;
        messages.push({
          role: "tool",
          content: typeof summary === "string" ? summary : JSON.stringify(summary),
          tool_call_id: call.id,
        });
        toolResults.push({ toolName: tool.name, data: result });
      } catch (error) {
        if (error instanceof KidTokenExpiredError) {
          throw error;
        }

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
