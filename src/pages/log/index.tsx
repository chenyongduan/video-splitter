import React, { useMemo, useRef, useState } from "react";
import { Button, Input, message } from "antd";
import LogToolbar from "./LogToolbar";
import LogSearchBar from "./LogSearchBar";
import LogViewer, { type LogViewerHandle } from "./LogViewer";
import { useLogSearch } from "./useLogSearch";

const LogPage: React.FC = () => {
  const [inputText, setInputText] = useState("");
  const [text, setText] = useState("");

  const lines = useMemo(
    () => (text.length ? text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n") : []),
    [text]
  );
  const search = useLogSearch(lines);
  const viewerRef = useRef<LogViewerHandle>(null);

  const loaded = text.length > 0;

  const handleLoad = () => {
    const t = inputText;
    setText(t);
    search.reset();
  };

  const handleClear = () => {
    setText("");
    setInputText("");
    search.reset();
  };

  const handleSearch = () => {
    const err = search.runSearch();
    if (err) message.error(err);
  };

  if (!loaded) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 24,
          gap: 12,
        }}
      >
        <Input.TextArea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleLoad();
            }
          }}
          placeholder="粘贴日志文本…  (Ctrl/Cmd+Enter 查看)"
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
          }}
        />
        <div>
          <Button
            type="primary"
            onClick={handleLoad}
            disabled={inputText.length === 0}
          >
            查看日志
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <LogToolbar
        lineCount={lines.length}
        onOpenSearch={search.openSearch}
        onClear={handleClear}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {search.showSearch && (
          <LogSearchBar
            query={search.query}
            caseSensitive={search.caseSensitive}
            wholeWord={search.wholeWord}
            useRegex={search.useRegex}
            matchCount={search.matchLineIndices.length}
            currentIndex={search.currentIndex}
            onQueryChange={search.setQuery}
            onSearch={handleSearch}
            onToggleCase={search.toggleCase}
            onToggleWholeWord={search.toggleWholeWord}
            onToggleRegex={search.toggleRegex}
            onNext={search.next}
            onPrev={search.prev}
            onClose={search.closeSearch}
          />
        )}
        <LogViewer
          ref={viewerRef}
          lines={lines}
          matcher={search.activeMatcher}
          currentLine={search.currentLine}
        />
      </div>
    </div>
  );
};

export default LogPage;
