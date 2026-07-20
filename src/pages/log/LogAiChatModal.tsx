import React, { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Empty, Input, Modal, Popover, Space, Spin, Switch, Typography, message } from "antd";
import { CheckOutlined, CopyOutlined, DownOutlined, SettingOutlined } from "@ant-design/icons";
import {
  DEFAULT_DEEPSEEK_MODEL,
  fetchDeepSeekBalance,
  fetchDeepSeekModels,
  getSelectedDeepSeekModel,
  setSelectedDeepSeekModel,
  type AiChatMessage,
  type ChatMessage,
  type DeepSeekModel,
} from "./aiClient";
import { getKidToken, setKidToken as persistKidToken } from "./kidApi";
import { runChatWithTools } from "./chatController";
import { isAbortError } from "./abortError";
import { formatAnalysisElapsed } from "./analysisElapsed";
import { isImeComposing, shouldSubmitOnEnter } from "./imeInput";
import { sanitizeAssistantHtml } from "./htmlMessage";
import {
  addInputHistory,
  getNextHistoryCursor,
  getPreviousHistoryCursor,
  isCursorOnFirstLine,
  isCursorOnLastLine,
} from "./inputHistory";

const { Text } = Typography;
const { TextArea } = Input;

interface DisplayChatMessage extends AiChatMessage {
  timeLabel: string;
}

interface LogAiChatModalProps {
  open: boolean;
  logText: string;
  onClose: () => void;
}

const LogAiChatModal: React.FC<LogAiChatModalProps> = ({ open, logText, onClose }) => {
  const [inputValue, setInputValue] = useState("");
  const [chatMessages, setChatMessages] = useState<DisplayChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedModel, setSelectedModel] = useState<DeepSeekModel>(getSelectedDeepSeekModel);
  const [modelOptions, setModelOptions] = useState<DeepSeekModel[]>([DEFAULT_DEEPSEEK_MODEL]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [balanceText, setBalanceText] = useState("--");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [includeLogContext, setIncludeLogContext] = useState(false);
  const [kidToken, setKidTokenInput] = useState(() => getKidToken());
  const [hoveredMessageKey, setHoveredMessageKey] = useState<string | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const analysisStartedAtRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);

  const hasMessages = chatMessages.length > 0;
  const canSubmit = submitting || inputValue.trim().length > 0;

  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [open, chatMessages]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!submitting) {
      analysisStartedAtRef.current = null;
      setAnalysisElapsedSeconds(0);
      return;
    }

    if (analysisStartedAtRef.current === null) {
      analysisStartedAtRef.current = Date.now();
    }

    const updateElapsed = () => {
      const startedAt = analysisStartedAtRef.current ?? Date.now();
      setAnalysisElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [submitting]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const models = await fetchDeepSeekModels();
        if (cancelled) return;
        setModelOptions(models);
        setSelectedModel((current) =>
          models.includes(current) ? current : models.includes(DEFAULT_DEEPSEEK_MODEL) ? DEFAULT_DEEPSEEK_MODEL : models[0]
        );
      } catch (error) {
        if (cancelled) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        message.error(errorMessage);
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSettingsOpenChange = (nextOpen: boolean) => {
    setSettingsOpen(nextOpen);
    if (!nextOpen) return;

    setBalanceLoading(true);
    void fetchDeepSeekBalance()
      .then((balance) => setBalanceText(balance))
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setBalanceText("--");
        message.error(errorMessage);
      })
      .finally(() => setBalanceLoading(false));
  };

  const handleModelChange = (model: DeepSeekModel) => {
    setSelectedModel(model);
    setSelectedDeepSeekModel(model);
  };

  const handleSend = async () => {
    const question = inputValue.trim();
    if (submitting || !question) return;

    const abortController = new AbortController();
    activeControllerRef.current = abortController;
    analysisStartedAtRef.current = Date.now();
    setAnalysisElapsedSeconds(0);

    const nextMessages: DisplayChatMessage[] = [
      ...chatMessages,
      { role: "user", content: question, timeLabel: formatTimeLabel(new Date()) },
    ];
    setChatMessages(nextMessages);
    setInputHistory((history) => addInputHistory(history, question));
    setHistoryCursor(null);
    setInputValue("");
    setSubmitting(true);

    try {
      const history: ChatMessage[] = nextMessages.map(({ role, content }) => ({ role, content }));
      const { content, toolResults } = await runChatWithTools(selectedModel, history, {
        includeLogContext,
        logText,
        signal: abortController.signal,
      });
      if (abortController.signal.aborted || activeControllerRef.current !== abortController) return;

      const replyText =
        content.trim() || (toolResults.length ? "已查询到以下数据：" : "AI 未返回可用内容");
      setChatMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: replyText,
          timeLabel: formatTimeLabel(new Date()),
        },
      ]);
    } catch (error) {
      if (isAbortError(error) || abortController.signal.aborted) return;

      const errorMessage = error instanceof Error ? error.message : String(error);
      message.error(errorMessage);
      setChatMessages(nextMessages);
    } finally {
      if (activeControllerRef.current === abortController) {
        activeControllerRef.current = null;
        setSubmitting(false);
        setAnalysisElapsedSeconds(0);
      }
    }
  };

  const handleStop = () => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    analysisStartedAtRef.current = null;
    setSubmitting(false);
    setAnalysisElapsedSeconds(0);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(event.target.value);
    setHistoryCursor(null);
  };

  const applyHistoryValue = (textArea: HTMLTextAreaElement, nextCursor: number | null) => {
    const historyValue = nextCursor === null ? "" : inputHistory[nextCursor];
    setHistoryCursor(nextCursor);
    setInputValue(historyValue);

    requestAnimationFrame(() => {
      textArea.setSelectionRange(historyValue.length, historyValue.length);
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isImeComposing(event, isComposingRef.current)) return;

    if (event.key === "ArrowUp") {
      if (!isCursorOnFirstLine(inputValue, event.currentTarget.selectionStart)) return;

      const nextCursor = getPreviousHistoryCursor(inputHistory, historyCursor);
      if (nextCursor === null) return;

      event.preventDefault();
      applyHistoryValue(event.currentTarget, nextCursor);
      return;
    }

    if (event.key !== "ArrowDown") return;
    if (historyCursor === null) return;
    if (!isCursorOnLastLine(inputValue, event.currentTarget.selectionStart)) return;

    event.preventDefault();
    applyHistoryValue(event.currentTarget, getNextHistoryCursor(inputHistory, historyCursor));
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      message.success("复制成功");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      message.error(`复制失败: ${errorMessage}`);
    }
  };

  return (
    <Modal
      open={open}
      title="AI 分析"
      footer={null}
      onCancel={onClose}
      width={880}
      centered
      destroyOnHidden
      style={{ maxHeight: "90vh" }}
      styles={{
        body: {
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          height: "calc(90vh - 120px)",
          maxHeight: "calc(90vh - 120px)",
        },
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 420,
            overflowY: "auto",
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            padding: 16,
            background: "#fff",
          }}
        >
          {hasMessages ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {chatMessages.map((item, index) => {
                const isUser = item.role === "user";
                const messageKey = `${item.role}-${index}`;
                const showCopyButton = hoveredMessageKey === messageKey;

                return (
                  <div
                    key={messageKey}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      onMouseEnter={() => setHoveredMessageKey(messageKey)}
                      onMouseLeave={() => setHoveredMessageKey((current) => (current === messageKey ? null : current))}
                      style={{
                        maxWidth: "80%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isUser ? "flex-end" : "flex-start",
                        gap: 6,
                      }}
                    >
                      {isUser ? (
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "#e6f4ff",
                            border: "1px solid #bae0ff",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                          }}
                        >
                          {item.content}
                        </div>
                      ) : (
                        <div
                          className="log-ai-message-html"
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "#f5f5f5",
                            border: "1px solid #e5e5e5",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            lineHeight: 1.6,
                            maxWidth: "100%",
                            overflowX: "auto",
                          }}
                          dangerouslySetInnerHTML={{ __html: sanitizeAssistantHtml(item.content) }}
                        />
                      )}
                      <div
                        style={{
                          minHeight: 24,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div
                          style={{
                            display: showCopyButton ? "flex" : "none",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {isUser ? (
                            <>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {item.timeLabel}
                              </Text>
                              <Button
                                type="text"
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => void handleCopyMessage(item.content)}
                                style={{
                                  width: 24,
                                  minWidth: 24,
                                  height: 24,
                                  padding: 0,
                                  color: "#666",
                                }}
                              />
                            </>
                          ) : (
                            <>
                              <Button
                                type="text"
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => void handleCopyMessage(item.content)}
                                style={{
                                  width: 24,
                                  minWidth: 24,
                                  height: 24,
                                  padding: 0,
                                  color: "#666",
                                }}
                              />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {item.timeLabel}
                              </Text>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {submitting && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "#f5f5f5",
                        border: "1px solid #e5e5e5",
                      }}
                    >
                      <Space size={8}>
                        <Spin size="small" />
                        <Text type="secondary">AI 分析中...</Text>
                      </Space>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, minWidth: 28, textAlign: "right" }}>
                      {formatAnalysisElapsed(analysisElapsedSeconds)}
                    </Text>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                minHeight: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Empty description="输入问题后开始分析日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextArea
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            placeholder="输入你想让 AI 分析的问题，例如：帮我判断断线原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            onPressEnter={(event) => {
              if (!shouldSubmitOnEnter(event, isComposingRef.current)) return;
              event.preventDefault();
              void handleSend();
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Text type="secondary">日志上下文</Text>
              <Switch checked={includeLogContext} onChange={setIncludeLogContext} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Popover
                open={settingsOpen}
                onOpenChange={handleSettingsOpenChange}
                trigger="click"
                placement="topRight"
                content={
                  <div
                    style={{
                      width: 320,
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      padding: "4px 2px",
                    }}
                  >
                    <Text strong style={{ fontSize: 18, lineHeight: "26px" }}>
                      久趣 Token
                    </Text>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        minHeight: 44,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "#f7f8fa",
                        border: "1px solid #edf0f2",
                      }}
                    >
                      <Text type="secondary">余额</Text>
                      <Text strong style={{ fontSize: 16 }}>
                        {balanceLoading ? <Spin size="small" /> : `${balanceText} 元`}
                      </Text>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Input.Password
                        value={kidToken}
                        size="large"
                        placeholder="请输入Token"
                        style={{ width: "100%" }}
                        onChange={(event) => {
                          setKidTokenInput(event.target.value);
                          persistKidToken(event.target.value);
                        }}
                      />
                    </div>
                  </div>
                }
              >
                <Button aria-label="设置" icon={<SettingOutlined />} />
              </Popover>
              <Dropdown
                placement="topLeft"
                trigger={["click"]}
                menu={{
                  items: modelOptions.map((model) => ({
                    key: model,
                    label: (
                      <div
                        style={{
                          minWidth: 180,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span>{model}</span>
                        {selectedModel === model ? <CheckOutlined /> : null}
                      </div>
                    ),
                  })),
                  selectable: false,
                  onClick: ({ key }) => handleModelChange(key as DeepSeekModel),
                }}
              >
                <Button loading={modelsLoading}>
                  <Space size={6}>
                    <span>{selectedModel}</span>
                    <DownOutlined />
                  </Space>
                </Button>
              </Dropdown>
              <Button onClick={() => setChatMessages([])} disabled={!hasMessages || submitting}>
                清空
              </Button>
              <Button
                type="primary"
                danger={submitting}
                onClick={() => {
                  if (submitting) {
                    handleStop();
                    return;
                  }
                  void handleSend();
                }}
                disabled={!canSubmit}
              >
                {submitting ? "停止" : "发送"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

function formatTimeLabel(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default LogAiChatModal;
