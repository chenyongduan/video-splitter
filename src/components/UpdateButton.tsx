import { DownloadOutlined } from "@ant-design/icons";
import { Button, message } from "antd";
import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "@tauri-apps/api/core";

/**
 * 启动后静默检查更新。只有发现新版本时才在导航栏显示入口。
 * latest.json 地址配置在 src-tauri/tauri.conf.json 的 plugins.updater.endpoints。
 */
export default function UpdateButton() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    void check({ timeout: 30_000 })
      .then((availableUpdate) => {
        if (disposed) {
          availableUpdate?.close();
          return;
        }
        setUpdate(availableUpdate);
      })
      .catch((error) => {
        // 检查失败不打扰用户，网络恢复后可在下次启动时重试。
        console.warn("检查更新失败", error);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const installUpdate = async () => {
    if (!update || installing) return;

    setInstalling(true);
    try {
      await update.downloadAndInstall();
      // Windows 安装器会在安装阶段自动退出；macOS 会执行到这里并重启。
      await relaunch();
    } catch (error) {
      console.error("安装更新失败", error);
      message.error("更新失败，请检查网络后重试");
      setInstalling(false);
    }
  };

  if (!update) return null;

  return (
    <Button
      type="primary"
      size="small"
      icon={<DownloadOutlined />}
      loading={installing}
      onClick={installUpdate}
      style={{ flexShrink: 0 }}
      title={`更新到 ${update.version}`}
    >
      {installing ? "更新中" : "更新"}
    </Button>
  );
}
