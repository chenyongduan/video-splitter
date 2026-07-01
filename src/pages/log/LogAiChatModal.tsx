import React, { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Empty, Input, Modal, Popover, Space, Spin, Switch, Typography, message } from "antd";
import { CheckOutlined, CopyOutlined, DownOutlined, SettingOutlined } from "@ant-design/icons";
import {
  DEFAULT_DEEPSEEK_MODEL,
  fetchDeepSeekBalance,
  fetchDeepSeekModels,
  requestLogAiAnalysis,
  type AiChatMessage,
  type DeepSeekModel,
} from "./aiClient";

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
  const [selectedModel, setSelectedModel] = useState<DeepSeekModel>(DEFAULT_DEEPSEEK_MODEL);
  const [modelOptions, setModelOptions] = useState<DeepSeekModel[]>([DEFAULT_DEEPSEEK_MODEL]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [balanceText, setBalanceText] = useState("--");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [includeLogContext, setIncludeLogContext] = useState(false);
  const [hoveredMessageKey, setHoveredMessageKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasMessages = chatMessages.length > 0;
  const canSubmit = inputValue.trim().length > 0 && !submitting;

  useEffect(() => {
    if (!open) {
      setInputValue("");
      setSubmitting(false);
      setSelectedModel(DEFAULT_DEEPSEEK_MODEL);
      setModelOptions([DEFAULT_DEEPSEEK_MODEL]);
      setModelsLoading(false);
      setSettingsOpen(false);
      setBalanceText("--");
      setBalanceLoading(false);
      setIncludeLogContext(false);
      setHoveredMessageKey(null);
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [open, chatMessages]);

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

  const handleSend = async () => {
    const question = inputValue.trim();
    if (!question) return;

    const nextMessages: DisplayChatMessage[] = [
      ...chatMessages,
      { role: "user", content: question, timeLabel: formatTimeLabel(new Date()) },
    ];
    setChatMessages(nextMessages);
    setInputValue("");
    setSubmitting(true);

    try {
      const reply = await requestLogAiAnalysis(
        logText,
        nextMessages.map(({ role, content }) => ({ role, content })),
        selectedModel,
        includeLogContext
      );
      setChatMessages([
        ...nextMessages,
        { role: "assistant", content: reply, timeLabel: formatTimeLabel(new Date()) },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      message.error(errorMessage);
      setChatMessages(nextMessages);
    } finally {
      setSubmitting(false);
    }
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
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: isUser ? "#e6f4ff" : "#f5f5f5",
                          border: `1px solid ${isUser ? "#bae0ff" : "#e5e5e5"}`,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          lineHeight: 1.6,
                        }}
                      >
                        {item.content}
                      </div>
                      <div
                        style={{
                          minHeight: 24,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 8,
                        }}
                      >
                        {isUser ? (
                          <>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <span style={{ visibility: showCopyButton ? "visible" : "hidden" }}>
                                {item.timeLabel}
                              </span>
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
                                visibility: showCopyButton ? "visible" : "hidden",
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
                                visibility: showCopyButton ? "visible" : "hidden",
                              }}
                            />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <span style={{ visibility: showCopyButton ? "visible" : "hidden" }}>
                                {item.timeLabel}
                              </span>
                            </Text>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {submitting && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
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
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="输入你想让 AI 分析的问题，例如：帮我判断断线原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            onPressEnter={(event) => {
              if (event.shiftKey) return;
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
                  <div style={{ minWidth: 180, display: "flex", flexDirection: "column", gap: 12 }}>
                    <Text strong>设置</Text>
                    <Text>
                      余额：
                      {balanceLoading ? <Spin size="small" style={{ marginLeft: 4 }} /> : `${balanceText} 元`}
                    </Text>
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
                  onClick: ({ key }) => setSelectedModel(key as DeepSeekModel),
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
              <Button type="primary" onClick={() => void handleSend()} loading={submitting} disabled={!canSubmit}>
                发送
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
