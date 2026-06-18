import React, { useEffect, useRef } from "react";
import { Input, Button, Space, Tooltip } from "antd";
import {
  CloseOutlined,
  UpOutlined,
  DownOutlined,
  SearchOutlined,
} from "@ant-design/icons";

export interface SearchBarProps {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchCount: number;
  currentIndex: number;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
  onToggleCase: () => void;
  onToggleWholeWord: () => void;
  onToggleRegex: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  query,
  caseSensitive,
  wholeWord,
  useRegex,
  matchCount,
  currentIndex,
  onQueryChange,
  onSearch,
  onToggleCase,
  onToggleWholeWord,
  onToggleRegex,
  onNext,
  onPrev,
  onClose,
  placeholder = "搜索... (回车搜索)",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const matchText =
    matchCount === 0 ? "无结果" : `${currentIndex + 1}/${matchCount}`;
  const matchColor = matchCount === 0 ? "#ff4d4f" : "#666";

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: active ? "1px solid #1677ff" : "1px solid #d9d9d9",
    borderRadius: 4,
    background: active ? "#e6f4ff" : "#fff",
    color: active ? "#1677ff" : "#666",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    userSelect: "none",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 16,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px",
        background: "#fff",
        borderRadius: "0 0 6px 6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        border: "1px solid #e8e8e8",
        borderTop: "none",
      }}
    >
      <Input
        ref={inputRef as any}
        size="small"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onPressEnter={onSearch}
        placeholder={placeholder}
        style={{ width: 200, fontSize: 13, height: 28 }}
        prefix={<SearchOutlined style={{ color: "#999" }} />}
      />
      <Space size={2}>
        <Tooltip title="区分大小写">
          <div style={btnStyle(caseSensitive)} onClick={onToggleCase}>
            Aa
          </div>
        </Tooltip>
        <Tooltip title="全词匹配">
          <div style={btnStyle(wholeWord)} onClick={onToggleWholeWord}>
            Ab
          </div>
        </Tooltip>
        <Tooltip title="正则表达式">
          <div style={btnStyle(useRegex)} onClick={onToggleRegex}>
            .*
          </div>
        </Tooltip>
      </Space>
      <span
        style={{
          fontSize: 12,
          color: matchColor,
          minWidth: 44,
          textAlign: "center",
        }}
      >
        {matchText}
      </span>
      <Space size={2}>
        <Button
          size="small"
          icon={<UpOutlined />}
          onClick={onPrev}
          disabled={matchCount === 0}
          style={{ width: 28, height: 28 }}
        />
        <Button
          size="small"
          icon={<DownOutlined />}
          onClick={onNext}
          disabled={matchCount === 0}
          style={{ width: 28, height: 28 }}
        />
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ width: 28, height: 28 }}
        />
      </Space>
    </div>
  );
};

export default SearchBar;
