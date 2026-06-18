import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, message } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import LogToolbar from "./LogToolbar";
import LogSearchBar from "./LogSearchBar";
import LogViewer, { type LogViewerHandle } from "./LogViewer";
import LogErrorBoundary from "./LogErrorBoundary";
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

  const loadText = useCallback(
    (content: string) => {
      setText(content);
      search.reset();
    },
    [search]
  );

  const openLogFile = useCallback(
    async (path: string) => {
      try {
        const content = await readTextFile(path);
        if (content.length === 0) {
          message.warning("文件为空");
          return;
        }
        loadText(content);
      } catch (e) {
        message.error(`打开文件失败: ${e}`);
      }
    },
    [loadText]
  );

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({ multiple: false });
      if (!selected) return;
      await openLogFile(selected as string);
    } catch (e) {
      message.error(`打开文件失败: ${e}`);
    }
  }, [openLogFile]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const paths = event.payload.paths;
        if (paths.length > 0) openLogFile(paths[0]);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openLogFile]);

  const handleLoad = () => {
    loadText(inputText);
  };

  const handleClear = () => {
    setText("");
    setInputText("");
    search.reset();
  };

  const handleSearch = () => {
    try {
      const err = search.runSearch();
      if (err) message.error(err);
    } catch (e) {
      message.error(`搜索出错: ${e}`);
    }
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
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="primary"
            onClick={handleLoad}
            disabled={inputText.length === 0}
          >
            查看日志
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={handleOpenFile}>
            选择文件
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
        onOpenFile={handleOpenFile}
      />
      <LogErrorBoundary>
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
      </LogErrorBoundary>
    </div>
  );
};

export default LogPage;
