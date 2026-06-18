import React from "react";
import { Button, Space, Typography } from "antd";
import { SearchOutlined, DeleteOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface LogToolbarProps {
  lineCount: number;
  onOpenSearch: () => void;
  onClear: () => void;
}

const LogToolbar: React.FC<LogToolbarProps> = ({
  lineCount,
  onOpenSearch,
  onClear,
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
        <Button icon={<SearchOutlined />} onClick={onOpenSearch}>
          搜索
        </Button>
        <Button icon={<DeleteOutlined />} danger onClick={onClear}>
          清空
        </Button>
      </Space>
    </div>
  );
};

export default LogToolbar;
