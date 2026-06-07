import React, { useEffect } from "react";
import { Layout, Tabs } from "antd";
import { useAppStore } from "./store/segmentStore";
import VideoPage from "./pages/video";
import AudioPage from "./pages/audio";
import ImagePage from "./pages/image";
import IconPage from "./pages/icon";
import JsonPage from "./pages/json";
import type { AppTab } from "./types";

const { Header, Content } = Layout;

const STORAGE_KEY = "mediakit_active_tab";

const App: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  // 启动时从 localStorage 恢复 tab
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ["video", "audio", "image", "icon", "json"].includes(saved)) {
      setActiveTab(saved as AppTab);
    }
  }, [setActiveTab]);

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
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#1677ff",
            whiteSpace: "nowrap",
          }}
        >
          MediaKit
        </span>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            { key: "video", label: "视频处理" },
            { key: "audio", label: "音频处理" },
            { key: "image", label: "图片处理" },
            { key: "icon", label: "App图标" },
            { key: "json", label: "JSON工具" },
          ]}
          style={{ marginBottom: 0 }}
        />
      </Header>

      <Content style={{ overflow: "auto", flex: 1 }}>
        {activeTab === "video" && <VideoPage />}
        {activeTab === "audio" && <AudioPage />}
        {activeTab === "image" && <ImagePage />}
        {activeTab === "icon" && <IconPage />}
        {activeTab === "json" && <JsonPage />}
      </Content>
    </Layout>
  );
};

export default App;
