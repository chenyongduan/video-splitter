import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layout, Popover, Tabs } from "antd";
import { useAppStore } from "./store/segmentStore";
import VideoPage from "./pages/video";
import AudioPage from "./pages/audio";
import ImagePage from "./pages/image";
import IconPage from "./pages/icon";
import JsonPage from "./pages/json";
import QrCodePage from "./pages/qrcode";
import LogPage from "./pages/log";
import UpdateButton from "./components/UpdateButton";
import type { AppTab } from "./types";

const { Header, Content } = Layout;

const STORAGE_KEY = "mediakit_active_tab";

const App: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const hasLogText = useAppStore((s) => s.logText.length > 0);
  const [logMounted, setLogMounted] = useState(false);

  // 启动时从 localStorage 恢复 tab
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ["video", "audio", "image", "icon", "json", "qrcode", "log"].includes(saved)) {
      setActiveTab(saved as AppTab);
    }
  }, [setActiveTab]);

  // Ctrl+Shift+F12 打开/关闭控制台（正式包也可用）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F12") {
        e.preventDefault();
        invoke("toggle_devtools").catch(() => {});
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 日志页打开大文件后，切走再切回时保留拆行和虚拟列表测量缓存。
  useEffect(() => {
    if (activeTab === "log" || hasLogText) {
      setLogMounted(true);
    }
  }, [activeTab, hasLogText]);

  const handleTabChange = (key: string) => {
    const tab = key as AppTab;
    setActiveTab(tab);
    localStorage.setItem(STORAGE_KEY, tab);
  };

  return (
    <Layout style={{ height: "100vh", overflow: "hidden", background: "#f5f5f5", ...(import.meta.env.PROD ? { userSelect: "none", WebkitUserSelect: "none" } : {}) }}>
      <Header
        style={{
          background: "#fff",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          flexShrink: 0,
        }}
      >
        <Popover
          placement="bottomLeft"
          mouseEnterDelay={0.15}
          content="版本 v0.2.3"
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#1677ff",
              whiteSpace: "nowrap",
              cursor: "default",
            }}
          >
            ToolKit
          </span>
        </Popover>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            { key: "video", label: "视频处理" },
            { key: "audio", label: "音频处理" },
            { key: "image", label: "图片处理" },
            { key: "icon", label: "App图标" },
            { key: "json", label: "JSON工具" },
            { key: "qrcode", label: "二维码" },
            { key: "log", label: "日志查看" },
          ]}
          style={{ marginBottom: 0, flex: "none", width: "fit-content" }}
        />
        <div style={{ marginLeft: "auto" }}>
          <UpdateButton />
        </div>
      </Header>

      <Content style={{ overflow: "auto", flex: 1, position: "relative" }}>
        {activeTab === "video" && <VideoPage />}
        {activeTab === "audio" && <AudioPage />}
        {activeTab === "image" && <ImagePage />}
        {activeTab === "icon" && <IconPage />}
        {activeTab === "json" && <JsonPage />}
        {activeTab === "qrcode" && <QrCodePage />}
        {logMounted && (
          <div
            aria-hidden={activeTab !== "log"}
            style={{
              position: "absolute",
              inset: 0,
              display: activeTab === "log" ? "block" : "none",
              pointerEvents: activeTab === "log" ? "auto" : "none",
            }}
          >
            <LogPage active={activeTab === "log"} />
          </div>
        )}
      </Content>
    </Layout>
  );
};

export default App;
