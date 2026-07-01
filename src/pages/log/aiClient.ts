const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODELS_API_URL = "https://api.deepseek.com/models";
const DEEPSEEK_BALANCE_API_URL = "https://api.deepseek.com/user/balance";
export const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim() ?? "";
const DEEPSEEK_SYSTEM_PROMPT = "You are a helpful assistant specializing in log analysis.";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export type DeepSeekModel = string;

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
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

export async function requestLogAiAnalysis(
  logText: string,
  messages: AiChatMessage[],
  model: DeepSeekModel,
  includeLogContext: boolean
) {
  ensureDeepSeekApiKey();

  const requestMessages = [
    {
      content: DEEPSEEK_SYSTEM_PROMPT,
      role: "system",
    },
  ];

  if (includeLogContext) {
    requestMessages.push({
      content: `以下是当前要分析的完整日志内容，请结合日志回答后续问题：\n\n${logText}`,
      role: "user",
    });
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      messages: [...requestMessages, ...messages],
      model,
      thinking: {
        type: "enabled",
      },
      reasoning_effort: "high",
      max_tokens: 4096,
      response_format: {
        type: "text",
      },
      stop: null,
      stream: false,
      stream_options: null,
      temperature: 1,
      top_p: 1,
      tools: null,
      tool_choice: "none",
      logprobs: false,
      top_logprobs: null,
    }),
  });

  const data = (await response.json()) as DeepSeekResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `AI 请求失败: ${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI 未返回可用内容");
  }

  return content;
}
