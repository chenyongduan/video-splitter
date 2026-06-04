import React, { useState } from "react";
import { InputNumber, Space, Typography, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { formatTime } from "../../utils/format";

interface SegmentEditorProps {
  duration: number;
  currentTime: number;
  onAdd: (start: number, end: number) => void;
}

const SegmentEditor: React.FC<SegmentEditorProps> = ({
  duration,
  currentTime,
  onAdd,
}) => {
  const [start, setStart] = useState<number>(0);
  const [end, setEnd] = useState<number>(30);

  const handleUseCurrentStart = () => {
    setStart(Math.floor(currentTime));
  };

  const handleUseCurrentEnd = () => {
    setEnd(Math.floor(currentTime));
  };

  const handleAdd = () => {
    if (start >= end) {
      return;
    }
    if (end > duration) {
      return;
    }
    onAdd(start, end);
    // Auto advance: next segment starts where this one ended
    setStart(Math.round(end));
    setEnd(Math.min(Math.round(end + 30), Math.round(duration)));
  };

  return (
    <Space wrap style={{ marginBottom: 12 }}>
      <Typography.Text>开始:</Typography.Text>
      <InputNumber
        min={0}
        max={duration}
        step={1}
        value={start}
        onChange={(v) => setStart(v || 0)}
        addonAfter={formatTime(start)}
        style={{ width: 160 }}
      />
      <a onClick={handleUseCurrentStart} style={{ fontSize: 12 }}>
        当前时间
      </a>

      <Typography.Text>结束:</Typography.Text>
      <InputNumber
        min={0}
        max={duration}
        step={1}
        value={end}
        onChange={(v) => setEnd(v || 0)}
        addonAfter={formatTime(end)}
        style={{ width: 160 }}
      />
      <a onClick={handleUseCurrentEnd} style={{ fontSize: 12 }}>
        当前时间
      </a>

      <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
        添加
      </Button>
    </Space>
  );
};

export default SegmentEditor;
