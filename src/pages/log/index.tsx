import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import LogToolbar from "./LogToolbar";
import LogDropZone from "./LogDropZone";
import SearchBar from "../../components/SearchBar";
import LogViewer, { type LogViewerHandle } from "./LogViewer";
import LogErrorBoundary from "./LogErrorBoundary";
import LogAnalysisModal from "./LogAnalysisModal";
import LogAiChatModal from "./LogAiChatModal";
import { useLogSearch } from "./useLogSearch";
import { analyzeLogText, type LogAnalysisResult } from "./logAnalysis";
import { useAppStore } from "../../store/segmentStore";

interface LogPageProps {
  active?: boolean;
}

const LogPage: React.FC<LogPageProps> = ({ active = true }) => {
  const logText = useAppStore((s) => s.logText);
  const setLogText = useAppStore((s) => s.setLogText);
  const clearLog = useAppStore((s) => s.clearLog);

  const lines = useMemo(
    () => (logText.length ? logText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n") : []),
    [logText]
  );
  const search = useLogSearch(lines);
  const viewerRef = useRef<LogViewerHandle>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [aiAnalysisOpen, setAiAnalysisOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<LogAnalysisResult>({
    device: null,
    rooms: [],
    diagnostic: {
      skynetDisconnectCount: 0,
      latencyCount: 0,
      averageLatency: null,
    },
  });
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  const loaded = logText.length > 0;

  const loadText = useCallback(
    (content: string) => {
      setLogText(content);
      search.reset();
    },
    [search, setLogText]
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

  const handleSearch = () => {
    try {
      const err = search.runSearch();
      if (err) message.error(err);
    } catch (e) {
      message.error(`搜索出错: ${e}`);
    }
  };

  const handleOpenSearch = useCallback(() => {
    search.openSearch();
    setSearchFocusSignal((signal) => signal + 1);
  }, [search]);

  const handleAnalyze = useCallback(() => {
    const result = analyzeLogText(logText);
    if (!result.device && result.rooms.length === 0 && result.diagnostic.skynetDisconnectCount === 0 && result.diagnostic.latencyCount === 0) {
      message.warning("未匹配到可分析的信息");
    }
    setAnalysisResult(result);
    setAnalysisOpen(true);
  }, [logText]);

  const handleJumpToLine = useCallback((lineNumber: number) => {
    setAnalysisOpen(false);
    requestAnimationFrame(() => {
      viewerRef.current?.scrollToLine(lineNumber - 1);
    });
  }, []);

  // Keyboard shortcuts (only active once a log is loaded):
  //   Ctrl/Cmd+F        open search
  //   Ctrl/Cmd+G        next match        Shift+Ctrl/Cmd+G  previous match
  //   Escape            close search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!active || !loaded) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        handleOpenSearch();
        return;
      }
      if (mod && (e.key === "g" || e.key === "G")) {
        if (!search.showSearch) return;
        e.preventDefault();
        if (e.shiftKey) search.prev();
        else search.next();
        return;
      }
      if (e.key === "Escape" && search.showSearch) {
        e.preventDefault();
        search.closeSearch();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [search, loaded, active, handleOpenSearch]);

  if (!loaded) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <LogToolbar
          lineCount={0}
          active={active}
          hasLogContent={false}
          onOpenSearch={handleOpenSearch}
          onAnalyze={handleAnalyze}
          onAiAnalyze={() => setAiAnalysisOpen(true)}
          onClose={clearLog}
          onOpenFile={handleOpenFile}
        />
        <LogAiChatModal
          open={aiAnalysisOpen}
          logText={logText}
          onClose={() => setAiAnalysisOpen(false)}
        />
        <LogDropZone onOpenFile={openLogFile} onPickFile={handleOpenFile} />
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <LogToolbar
        lineCount={lines.length}
        active={active}
        hasLogContent={loaded}
        onOpenSearch={handleOpenSearch}
        onAnalyze={handleAnalyze}
        onAiAnalyze={() => setAiAnalysisOpen(true)}
        onClose={clearLog}
        onOpenFile={handleOpenFile}
      />
      <LogAnalysisModal
        open={analysisOpen}
        result={analysisResult}
        lines={lines}
        onClose={() => setAnalysisOpen(false)}
        onJumpToLine={handleJumpToLine}
      />
      <LogAiChatModal
        open={aiAnalysisOpen}
        logText={logText}
        onClose={() => setAiAnalysisOpen(false)}
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
          {active && search.showSearch && (
            <SearchBar
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
              focusSignal={searchFocusSignal}
            />
          )}
          <LogViewer
            ref={viewerRef}
            lines={lines}
            matcher={search.activeMatcher}
            currentLine={search.currentLine}
            active={active}
          />
        </div>
      </LogErrorBoundary>
    </div>
  );
};

export default LogPage;
