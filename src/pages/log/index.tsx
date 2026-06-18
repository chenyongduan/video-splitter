import React, { useState } from "react";
import { Button, Input } from "antd";

const LogPage: React.FC = () => {
  const [inputText, setInputText] = useState("");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: 24, gap: 12 }}>
      <Input.TextArea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="粘贴日志文本…"
        style={{ flex: 1, resize: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
      />
      <div>
        <Button type="primary" disabled={inputText.length === 0}>
          查看日志
        </Button>
      </div>
    </div>
  );
};

export default LogPage;
