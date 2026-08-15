import React, { useMemo, useRef, useState } from "react";
import { Button, Card, Input, QRCode, Select, Typography, message } from "antd";
import {
  QR_MAX_BYTES,
  copyQrImage,
  downloadQrPng,
  getQrCanvas,
  textByteLength,
} from "../../utils/qrcode";

const { Text, Paragraph } = Typography;

const QR_DEFAULT_SIZE = 280;

// 导出尺寸可选项（仅影响下载与复制的图片大小）
const QR_EXPORT_SIZES = [128, 256, 300, 400, 500, 600] as const;

// ---- SVG 图标（Lucide 线条风格，24 viewBox，禁止 emoji 当图标） ----

const QrIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect width="5" height="5" x="3" y="3" rx="1" />
    <rect width="5" height="5" x="16" y="3" rx="1" />
    <rect width="5" height="5" x="3" y="16" rx="1" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
    <path d="M21 21v.01" />
    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
    <path d="M3 12h.01" />
    <path d="M12 3h.01" />
    <path d="M12 16v.01" />
    <path d="M16 12h1" />
    <path d="M21 12v.01" />
    <path d="M12 21v-1" />
  </svg>
);

const DownloadIcon: React.FC = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const QrCodePage: React.FC = () => {
  const [text, setText] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [qrSize, setQrSize] = useState(300);
  // 隐藏的高清画布，仅供下载/复制时按导出尺寸取图
  const exportRef = useRef<HTMLDivElement>(null);

  const byteLength = useMemo(() => textByteLength(text), [text]);
  const overflow = byteLength > QR_MAX_BYTES;
  const hasContent = text.trim().length > 0;

  const handleGenerate = () => {
    if (!hasContent || overflow) return;
    setQrValue(text);
  };

  const handleDownload = async () => {
    const canvas = getQrCanvas(exportRef.current, qrSize);
    if (!canvas) return;
    try {
      await downloadQrPng(canvas);
      message.success("二维码已保存");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(`保存失败: ${errorMessage}`);
    }
  };

  const handleCopy = async () => {
    const canvas = getQrCanvas(exportRef.current, qrSize);
    if (!canvas) return;
    try {
      await copyQrImage(canvas);
      message.success("二维码已复制到剪贴板");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(`复制失败: ${errorMessage}`);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1080, margin: "0 auto", width: "100%" }}>
      {/* 卡片通用样式：大圆角 + 细边框 + 柔和阴影 */}
      <style>{`
        .tk-qr-card {
          border-radius: 16px;
          border: 1px solid #ececf0;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        }
        .tk-qr-card .ant-card-head {
          border-bottom: 1px solid #f0f0f3;
        }
        .tk-qr-btn {
          transition: opacity 200ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .tk-qr-btn {
            transition: none;
          }
        }
      `}</style>

      <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>
        <Card
          title="文本内容"
          className="tk-qr-card"
          style={{ flex: "1 1 420px", minWidth: 320 }}
          styles={{ body: { display: "flex", flexDirection: "column", height: "calc(100% - 57px)" } }}
        >
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={(e) => {
              // Cmd/Ctrl + Enter 快捷生成
              if (e.metaKey || e.ctrlKey) handleGenerate();
            }}
            placeholder="输入文本内容，例如 https://example.com"
            autoSize={{ minRows: 12, maxRows: 20 }}
            maxLength={5000}
            status={overflow ? "error" : undefined}
          />

          {/* 字节用量：右对齐展示在输入框下方 */}
          <Text
            type={overflow ? "danger" : "secondary"}
            style={{ fontSize: 12, display: "block", marginTop: 4, textAlign: "right" }}
          >
            {byteLength} / {QR_MAX_BYTES} 字节
          </Text>

          {overflow && (
            <Text type="danger" style={{ display: "block", marginTop: 8 }}>
              内容超出二维码容量（当前 {byteLength} 字节，最多 {QR_MAX_BYTES} 字节），请缩短文本
            </Text>
          )}

          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            支持网址、文本等任意内容；Cmd/Ctrl + Enter 可快速生成。
          </Paragraph>

          <div style={{ marginTop: "auto", paddingTop: 16, display: "flex", gap: 12 }}>
            <Button
              className="tk-qr-btn"
              block
              size="large"
              style={{ height: 40 }}
              disabled={!text && !qrValue}
              onClick={() => {
                setText("");
                setQrValue("");
              }}
            >
              清空
            </Button>
            <Button
              type="primary"
              className="tk-qr-btn"
              block
              size="large"
              icon={<QrIcon size={16} />}
              disabled={!hasContent || overflow}
              onClick={handleGenerate}
            >
              生成二维码
            </Button>
          </div>
        </Card>

        <Card title="二维码" className="tk-qr-card" style={{ flex: "0 0 auto", width: 380 }}>
          <div
            style={{
              minHeight: QR_DEFAULT_SIZE,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            {qrValue ? (
              <QRCode value={qrValue} type="canvas" size={QR_DEFAULT_SIZE} errorLevel="M" />
            ) : (
              /* 空状态：虚线占位框 + 图标提示，而非一行灰字 */
              <div
                style={{
                  width: QR_DEFAULT_SIZE,
                  height: QR_DEFAULT_SIZE,
                  borderRadius: 16,
                  border: `2px dashed ${overflow ? "#ffccc7" : "#e5e7eb"}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: overflow ? "#ff7875" : "#b0b6bf",
                  transition: "border-color 200ms ease",
                }}
              >
                <QrIcon size={40} />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {overflow ? "内容超出容量，无法生成" : "输入内容后点击「生成二维码」"}
                </Text>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 20,
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              导出尺寸
            </Text>
            <Select
              value={qrSize}
              onChange={(value) => setQrSize(value)}
              style={{ flex: 1, width: "auto" }}
              options={QR_EXPORT_SIZES.map((size) => ({
                value: size,
                label: `${size} × ${size}`,
              }))}
            />
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <Button
              type="primary"
              className="tk-qr-btn"
              block
              size="large"
              style={{ height: 40 }}
              icon={<DownloadIcon />}
              disabled={!qrValue}
              onClick={handleDownload}
            >
              下载 PNG
            </Button>
            <Button
              className="tk-qr-btn"
              block
              size="large"
              style={{ height: 40 }}
              icon={<CopyIcon />}
              disabled={!qrValue}
              onClick={handleCopy}
            >
              复制图片
            </Button>
          </div>
        </Card>
      </div>
      {qrValue && (
        <div ref={exportRef} style={{ display: "none" }} aria-hidden>
          {/* marginSize 静区：导出图片四周留 2 个模块的白边 */}
          <QRCode
            value={qrValue}
            type="canvas"
            size={qrSize}
            errorLevel="M"
            marginSize={2}
          />
        </div>
      )}
    </div>
  );
};

export default QrCodePage;
