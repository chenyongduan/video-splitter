import React, { useCallback } from "react";
import { Button, message } from "antd";
import {
  AppleOutlined,
  AndroidOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/segmentStore";
import {
  exportIosIcons,
  exportAndroidIcons,
  exportTauriIcons,
  applyCornerRadius,
} from "../../utils/icon";

const IconExporter: React.FC = () => {
  const iconPath = useAppStore((s) => s.iconPath);
  const iconInfo = useAppStore((s) => s.iconInfo);
  const isIconProcessing = useAppStore((s) => s.isIconProcessing);
  const setIconProcessing = useAppStore((s) => s.setIconProcessing);
  const iconProcessResult = useAppStore((s) => s.iconProcessResult);
  const setIconProcessResult = useAppStore((s) => s.setIconProcessResult);
  const cornerRadius = useAppStore((s) => s.iconCornerRadius);

  const handleExport = useCallback(
    async (platform: "ios" | "android" | "tauri") => {
      if (!iconPath || !iconInfo) return;

      // 选择输出目录
      let outputDir: string | null = null;
      try {
        outputDir = (await open({ directory: true })) as string | null;
      } catch (err) {
        message.error(`选择目录失败: ${err}`);
        return;
      }
      if (!outputDir) return;

      setIconProcessing(true);
      let cleanup: (() => Promise<void>) | null = null;
      try {
        // 应用圆角（如果有的话）
        const { tempPath, cleanup: cleanupFn } = await applyCornerRadius(
          iconPath,
          cornerRadius,
        );
        cleanup = cleanupFn;
        const effectivePath = tempPath ?? iconPath;

        let result: { outputDir: string; fileCount: number };
        const platformLabel =
          platform === "ios"
            ? "iOS"
            : platform === "android"
              ? "Android"
              : "Tauri";

        if (platform === "ios") {
          result = await exportIosIcons(effectivePath, outputDir, iconInfo.width);
        } else if (platform === "android") {
          result = await exportAndroidIcons(effectivePath, outputDir);
        } else {
          result = await exportTauriIcons(effectivePath, outputDir, iconInfo.width);
        }

        setIconProcessResult({
          platform,
          outputDir: result.outputDir,
          fileCount: result.fileCount,
        });
        message.success(
          `${platformLabel} 图标导出完成，共 ${result.fileCount} 个文件`,
        );

        // 自动打开输出目录
        try {
          await revealItemInDir(result.outputDir);
        } catch {
          // ignore
        }
      } catch (err) {
        message.error(`导出失败: ${err}`);
      } finally {
        if (cleanup) await cleanup();
        setIconProcessing(false);
      }
    },
    [iconPath, iconInfo, cornerRadius, setIconProcessing, setIconProcessResult],
  );

  if (!iconPath || !iconInfo) return null;

  const exportingPlatform = iconProcessResult?.platform;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <Button
        type="primary"
        icon={<AppleOutlined />}
        loading={isIconProcessing && exportingPlatform === "ios"}
        disabled={isIconProcessing}
        onClick={() => handleExport("ios")}
        style={{ minWidth: 160 }}
      >
        导出 iOS 图标
      </Button>
      <Button
        type="primary"
        icon={<AndroidOutlined />}
        loading={isIconProcessing && exportingPlatform === "android"}
        disabled={isIconProcessing}
        onClick={() => handleExport("android")}
        style={{ minWidth: 160, background: "#52c41a", borderColor: "#52c41a" }}
      >
        导出 Android 图标
      </Button>
      <Button
        type="primary"
        icon={<DesktopOutlined />}
        loading={isIconProcessing && exportingPlatform === "tauri"}
        disabled={isIconProcessing}
        onClick={() => handleExport("tauri")}
        style={{ minWidth: 160, background: "#fa8c16", borderColor: "#fa8c16" }}
      >
        导出 Tauri 图标
      </Button>
    </div>
  );
};

export default IconExporter;
