import React from "react";
import { Button, Space, Tooltip, Typography } from "antd";
import { BarChartOutlined, CloseOutlined, FolderOpenOutlined, SearchOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface LogToolbarProps {
  lineCount: number;
  active?: boolean;
  onOpenSearch: () => void;
  onAnalyze: () => void;
  onClose: () => void;
  onOpenFile: () => void;
}

const LogToolbar: React.FC<LogToolbarProps> = ({
  lineCount,
  active = true,
  onOpenSearch,
  onAnalyze,
  onClose,
  onOpenFile,
}) => {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        共 {lineCount.toLocaleString()} 行
      </Text>
      <Space>
        <Tooltip title="打开文件" open={active ? undefined : false}>
          <Button icon={<FolderOpenOutlined />} onClick={onOpenFile}>
            打开文件
          </Button>
        </Tooltip>
        <Tooltip title="搜索 (Ctrl/Cmd+F)" open={active ? undefined : false}>
          <Button icon={<SearchOutlined />} onClick={onOpenSearch}>
            搜索
          </Button>
        </Tooltip>
        <Tooltip title="分析日志内容" open={active ? undefined : false}>
          <Button icon={<BarChartOutlined />} onClick={onAnalyze}>
            分析
          </Button>
        </Tooltip>
        <Button icon={<CloseOutlined />} danger onClick={onClose}>
          关闭
        </Button>
      </Space>
    </div>
  );
};

export default LogToolbar;
