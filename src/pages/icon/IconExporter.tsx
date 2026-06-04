import React, { useCallback, useState } from "react";
import { Button, message } from "antd";
import {
  AppleOutlined,
  AndroidOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/segmentStore";
import { exportIosIcons, exportAndroidIcons, exportTauriIcons } from "../../utils/icon";

const IconExporter: React.FC = () => {
  const iconPath = useAppStore((s) => s.iconPath);
  const iconInfo = useAppStore((s) => s.iconInfo);
  const isIconProcessing = useAppStore((s) => s.isIconProcessing);
  const setIconProcessing = useAppStore((s) => s.setIconProcessing);
  const iconProcessResult = useAppStore((s) => s.iconProcessResult);
  const setIconProcessResult = useAppStore((s) => s.setIconProcessResult);

  const [iosPath, setIosPath] = useState("");
  const [androidPath, setAndroidPath] = useState("");
  const [tauriPath, setTauriPath] = useState("");

  const handleSelectIosPath = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setIosPath(selected as string);
      }
    } catch (err) {
      message.error(`选择目录失败: ${err}`);
    }
  }, []);

  const handleSelectAndroidPath = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setAndroidPath(selected as string);
      }
    } catch (err) {
      message.error(`选择目录失败: ${err}`);
    }
  }, []);

  const handleSelectTauriPath = useCallback(async () => {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setTauriPath(selected as string);
      }
    } catch (err) {
      message.error(`选择目录失败: ${err}`);
    }
  }, []);

  const handleExportIos = useCallback(async () => {
    if (!iconPath || !iconInfo) return;
    if (!iosPath) {
      message.warning("请先选择输出目录");
      return;
    }

    setIconProcessing(true);
    try {
      const result = await exportIosIcons(iconPath, iosPath, iconInfo.width);
      setIconProcessResult({
        platform: "ios",
        outputDir: result.outputDir,
        fileCount: result.fileCount,
      });
      message.success(`iOS 图标导出完成，共 ${result.fileCount} 个文件`);
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setIconProcessing(false);
    }
  }, [iconPath, iconInfo, iosPath, setIconProcessing, setIconProcessResult]);

  const handleExportAndroid = useCallback(async () => {
    if (!iconPath || !iconInfo) return;
    if (!androidPath) {
      message.warning("请先选择输出目录");
      return;
    }

    setIconProcessing(true);
    try {
      const result = await exportAndroidIcons(iconPath, androidPath);
      setIconProcessResult({
        platform: "android",
        outputDir: result.outputDir,
        fileCount: result.fileCount,
      });
      message.success(`Android 图标导出完成，共 ${result.fileCount} 个文件`);
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setIconProcessing(false);
    }
  }, [iconPath, iconInfo, androidPath, setIconProcessing, setIconProcessResult]);

  const handleExportTauri = useCallback(async () => {
    if (!iconPath || !iconInfo) return;
    if (!tauriPath) {
      message.warning("请先选择输出目录");
      return;
    }

    setIconProcessing(true);
    try {
      const result = await exportTauriIcons(iconPath, tauriPath, iconInfo.width);
      setIconProcessResult({
        platform: "tauri",
        outputDir: result.outputDir,
        fileCount: result.fileCount,
      });
      message.success(`Tauri 图标导出完成，共 ${result.fileCount} 个文件`);
    } catch (err) {
      message.error(`导出失败: ${err}`);
    } finally {
      setIconProcessing(false);
    }
  }, [iconPath, iconInfo, tauriPath, setIconProcessing, setIconProcessResult]);

  const handleOpenDir = useCallback(async (dir: string) => {
    try {
      await revealItemInDir(dir);
    } catch {
      // ignore
    }
  }, []);

  if (!iconPath || !iconInfo) return null;

  const sourceSize = iconInfo.width;

  // iOS 尺寸列表
  const iosSizes = [1024, 512, 256, 128, 64, 32].filter(
    (s) => sourceSize >= s,
  );

  // Android 密度列表
  const androidDensities = [
    { folder: "mipmap-mdpi", size: 48 },
    { folder: "mipmap-hdpi", size: 72 },
    { folder: "mipmap-xhdpi", size: 96 },
    { folder: "mipmap-xxhdpi", size: 144 },
    { folder: "mipmap-xxxhdpi", size: 192 },
  ];

  // Tauri 图标列表
  const tauriIcons = [
    { filename: "32x32.png", size: 32 },
    { filename: "128x128.png", size: 128 },
    { filename: "128x128@2x.png", size: 256 },
    { filename: "icon.ico", size: 256 },
    { filename: "icon.png", size: 1024 },
    { filename: "icon.icns", size: 1024 },
  ].filter((i) => sourceSize >= i.size);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {/* iOS Panel */}
      <div
        style={{
          flex: 1,
          minWidth: 280,
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e8e8e8",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <AppleOutlined style={{ fontSize: 18 }} />
          iOS 图标
        </div>

        {/* 尺寸列表 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {iosSizes.map((s) => (
            <span
              key={s}
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
                background: "#f0f5ff",
                color: "#1677ff",
                border: "1px solid #d6e4ff",
              }}
            >
              {s}×{s}
            </span>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#999",
            marginBottom: 12,
          }}
        >
          输出：ios/AppIcon.appiconset/（含 Contents.json）
        </div>

        {/* 路径选择 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleSelectIosPath}
            style={{ flexShrink: 0 }}
          >
            选择目录
          </Button>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: iosPath ? "#333" : "#bbb",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "32px",
            }}
          >
            {iosPath || "未选择输出目录"}
          </div>
        </div>

        <Button
          type="primary"
          icon={<AppleOutlined />}
          loading={isIconProcessing}
          disabled={!iosPath}
          onClick={handleExportIos}
          block
        >
          导出 iOS 图标
        </Button>

        {/* 成功后显示打开目录 */}
        {iconProcessResult && iconProcessResult.platform === "ios" && (
          <Button
            type="link"
            icon={<FolderOpenOutlined />}
            onClick={() => handleOpenDir(iconProcessResult.outputDir)}
            style={{ marginTop: 8, padding: 0 }}
          >
            打开输出目录
          </Button>
        )}
      </div>

      {/* Android Panel */}
      <div
        style={{
          flex: 1,
          minWidth: 280,
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e8e8e8",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <AndroidOutlined style={{ fontSize: 18 }} />
          Android 图标
        </div>

        {/* 密度列表 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {androidDensities.map((d) => (
            <span
              key={d.folder}
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
                background: "#f6ffed",
                color: "#52c41a",
                border: "1px solid #d9f7be",
              }}
            >
              {d.folder} ({d.size}px)
            </span>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#999",
            marginBottom: 12,
          }}
        >
          输出：android/mipmap-*/（含 ic_launcher.png）
        </div>

        {/* 路径选择 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleSelectAndroidPath}
            style={{ flexShrink: 0 }}
          >
            选择目录
          </Button>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: androidPath ? "#333" : "#bbb",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "32px",
            }}
          >
            {androidPath || "未选择输出目录"}
          </div>
        </div>

        <Button
          type="primary"
          icon={<AndroidOutlined />}
          loading={isIconProcessing}
          disabled={!androidPath}
          onClick={handleExportAndroid}
          block
          style={{ background: "#52c41a", borderColor: "#52c41a" }}
        >
          导出 Android 图标
        </Button>

        {/* 成功后显示打开目录 */}
        {iconProcessResult && iconProcessResult.platform === "android" && (
          <Button
            type="link"
            icon={<FolderOpenOutlined />}
            onClick={() => handleOpenDir(iconProcessResult.outputDir)}
            style={{ marginTop: 8, padding: 0 }}
          >
            打开输出目录
          </Button>
        )}
      </div>

      {/* Tauri Panel */}
      <div
        style={{
          flex: 1,
          minWidth: 280,
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e8e8e8",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          🖥️ Tauri 图标
        </div>

        {/* 文件列表 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {tauriIcons.map((t) => (
            <span
              key={t.filename}
              style={{
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
                background: "#fff7e6",
                color: "#fa8c16",
                border: "1px solid #ffd591",
              }}
            >
              {t.filename}
            </span>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#999",
            marginBottom: 12,
          }}
        >
          输出：tauri/icons/（含 ico、icns、png）
        </div>

        {/* 路径选择 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            icon={<FolderOpenOutlined />}
            onClick={handleSelectTauriPath}
            style={{ flexShrink: 0 }}
          >
            选择目录
          </Button>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              color: tauriPath ? "#333" : "#bbb",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "32px",
            }}
          >
            {tauriPath || "未选择输出目录"}
          </div>
        </div>

        <Button
          type="primary"
          loading={isIconProcessing}
          disabled={!tauriPath}
          onClick={handleExportTauri}
          block
          style={{ background: "#fa8c16", borderColor: "#fa8c16" }}
        >
          导出 Tauri 图标
        </Button>

        {/* 成功后显示打开目录 */}
        {iconProcessResult && iconProcessResult.platform === "tauri" && (
          <Button
            type="link"
            icon={<FolderOpenOutlined />}
            onClick={() => handleOpenDir(iconProcessResult.outputDir)}
            style={{ marginTop: 8, padding: 0 }}
          >
            打开输出目录
          </Button>
        )}
      </div>
    </div>
  );
};

export default IconExporter;
