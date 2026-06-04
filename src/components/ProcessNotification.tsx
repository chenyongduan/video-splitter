import React, { useEffect, useState } from "react";
import { Alert, Button } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface ProcessNotificationProps {
  /** 任意 process result，非 null 时显示通知 */
  result: {
    inputPath: string;
    outputPath: string;
    inputFormat: string;
    outputFormat: string;
    inputSize: number;
    outputSize: number;
  } | null;
  /** 额外的描述行 */
  extraLines?: React.ReactNode;
  onDone?: () => void;
}

const ProcessNotification: React.FC<ProcessNotificationProps> = ({
  result,
  extraLines,
  onDone,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (result) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [result, onDone]);

  if (!result || !visible) return null;

  const handleOpenDir = async () => {
    await revealItemInDir(result.outputPath);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        width: 480,
        animation: "slideDown 0.3s ease",
      }}
    >
      <Alert
        type="success"
        showIcon
        closable
        message="处理完成"
        onClose={() => {
          setVisible(false);
          onDone?.();
        }}
        description={
          <div style={{ fontSize: 13 }}>
            <div>
              文件名：
              {result.inputPath.split(/[/\\]/).pop()} →{" "}
              {result.outputPath.split(/[/\\]/).pop()}
            </div>
            <div>
              格式：{result.inputFormat.toUpperCase()} →{" "}
              {result.outputFormat.toUpperCase()}
            </div>
            {extraLines}
            <Button
              size="small"
              icon={<FolderOutlined />}
              style={{ marginTop: 8 }}
              onClick={handleOpenDir}
            >
              打开文件所在目录
            </Button>
          </div>
        }
      />
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ProcessNotification;
