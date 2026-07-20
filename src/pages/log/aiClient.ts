const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODELS_API_URL = "https://api.deepseek.com/models";
const DEEPSEEK_BALANCE_API_URL = "https://api.deepseek.com/user/balance";
export const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim() ?? "";
const DEEPSEEK_SYSTEM_PROMPT = "You are a helpful assistant specializing in log analysis.";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export type DeepSeekModel = string;
const DEEPSEEK_MODEL_KEY = "mediakit_deepseek_model";

/** Returns the model selected in the previous AI analysis session. */
export function getSelectedDeepSeekModel(): DeepSeekModel {
  return localStorage.getItem(DEEPSEEK_MODEL_KEY)?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

/** Persists the user's AI analysis model preference for the next launch. */
export function setSelectedDeepSeekModel(model: DeepSeekModel): void {
  const normalizedModel = model.trim();
  if (normalizedModel) {
    localStorage.setItem(DEEPSEEK_MODEL_KEY, normalizedModel);
  } else {
    localStorage.removeItem(DEEPSEEK_MODEL_KEY);
  }
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Tool call as returned by the model. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** A function definition sent to the model so it can decide which tool to call. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

/** Chat message in the OpenAI/DeepSeek shape (covers system/user/assistant/tool + tool-use fields). */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** Raw assistant message returned by chatCompletion (may carry tool_calls instead of content). */
export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
}

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
}

interface DeepSeekModelListResponse {
  data?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface DeepSeekBalanceResponse {
  balance_infos?: Array<{
    currency?: string;
    total_balance?: string;
  }>;
  error?: {
    message?: string;
  };
}

function ensureDeepSeekApiKey() {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("请先在本地 .env 文件中配置 VITE_DEEPSEEK_API_KEY");
  }
}

export async function fetchDeepSeekModels() {
  ensureDeepSeekApiKey();

  const response = await fetch(DEEPSEEK_MODELS_API_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
  });

  const data = (await response.json()) as DeepSeekModelListResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `获取模型列表失败: ${response.status}`);
  }

  const modelIds = (data.data || [])
    .map((item) => item.id?.trim())
    .filter((item): item is string => Boolean(item));

  if (modelIds.length === 0) {
    return [DEFAULT_DEEPSEEK_MODEL];
  }

  const deduped = Array.from(new Set(modelIds));
  deduped.sort((left, right) => {
    if (left === DEFAULT_DEEPSEEK_MODEL) return -1;
    if (right === DEFAULT_DEEPSEEK_MODEL) return 1;
    return left.localeCompare(right);
  });

  return deduped;
}

export async function fetchDeepSeekBalance() {
  ensureDeepSeekApiKey();

  const response = await fetch(DEEPSEEK_BALANCE_API_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
  });

  const data = (await response.json()) as DeepSeekBalanceResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `获取余额失败: ${response.status}`);
  }

  const balanceInfo =
    data.balance_infos?.find((item) => item.currency === "CNY") ?? data.balance_infos?.find((item) => item.total_balance);

  const balance = Number(balanceInfo?.total_balance);
  if (!Number.isFinite(balance)) {
    throw new Error("未获取到可用余额");
  }

  return balance.toFixed(2);
}

export interface ChatCompletionOptions {
  model: DeepSeekModel;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
  signal?: AbortSignal;
}

/**
 * Low-level chat completion. Returns the raw assistant message so callers can
 * inspect tool_calls and drive a tool-use loop. When tools are supplied, the
 * reasoning params (thinking/reasoning_effort) are omitted because they can
 * conflict with tool-use on some DeepSeek models.
 */
export async function chatCompletion({
  model,
  messages,
  tools,
  toolChoice,
  signal,
}: ChatCompletionOptions): Promise<AssistantMessage> {
  ensureDeepSeekApiKey();

  const useTools = Boolean(tools && tools.length > 0);

  const body: Record<string, unknown> = {
    messages,
    model,
    max_tokens: 4096,
    response_format: { type: "text" },
    stop: null,
    stream: false,
    stream_options: null,
    temperature: 1,
    top_p: 1,
    logprobs: false,
    top_logprobs: null,
  };

  if (useTools) {
    body.tools = tools;
    body.tool_choice = toolChoice ?? "auto";
  } else {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = "high";
    body.tools = null;
    body.tool_choice = "none";
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = (await response.json()) as DeepSeekChatResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `AI 请求失败: ${response.status}`);
  }

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error("AI 未返回可用内容");
  }

  return {
    role: "assistant",
    content: message.content?.trim() ?? null,
    tool_calls: message.tool_calls,
  };
}

/**
 * Plain text chat (backward-compatible). Builds the system + optional log
 * context + history, then returns the assistant text. Tool-use is disabled.
 */
export async function requestLogAiAnalysis(
  logText: string,
  messages: AiChatMessage[],
  model: DeepSeekModel,
  includeLogContext: boolean
) {
  const requestMessages: ChatMessage[] = [{ role: "system", content: DEEPSEEK_SYSTEM_PROMPT }];

  if (includeLogContext) {
    requestMessages.push({
      role: "user",
      content: `以下是当前要分析的完整日志内容，请结合日志回答后续问题：\n\n${logText}`,
    });
  }

  requestMessages.push(...messages);

  const assistant = await chatCompletion({ model, messages: requestMessages });
  if (!assistant.content) {
    throw new Error("AI 未返回可用内容");
  }
  return assistant.content;
}
