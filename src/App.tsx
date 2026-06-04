import React from "react";
import { Layout, Tabs } from "antd";
import { useAppStore } from "./store/segmentStore";
import VideoPage from "./pages/video";
import AudioPage from "./pages/audio";

const { Header, Content } = Layout;

const App: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  return (
    <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <Header
        style={{
          background: "#fff",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
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
          onChange={(key) => setActiveTab(key as "video" | "audio")}
          items={[
            { key: "video", label: "视频处理" },
            { key: "audio", label: "音频处理" },
            { key: "image", label: "图片处理", disabled: true },
          ]}
          style={{ marginBottom: 0 }}
        />
      </Header>

      <Content>
        {activeTab === "video" && <VideoPage />}
        {activeTab === "audio" && <AudioPage />}
      </Content>
    </Layout>
  );
};

export default App;
