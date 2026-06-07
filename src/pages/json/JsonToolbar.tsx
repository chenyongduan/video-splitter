import React from "react";
import { Button, Space, Tooltip, message } from "antd";
import {
  FolderOpenOutlined,
  SaveOutlined,
  FileAddOutlined,
  AlignLeftOutlined,
  ShrinkOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";
import type { JsonNode, VisibleLine, JsonValidationResult } from "../../types";

const JsonToolbar: React.FC = () => {
  const {
    jsonPath,
    jsonFileName,
    isJsonLoaded,
    setJsonFile,
    setJsonValidationError,
  } = useAppStore();

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileName = filePath.split(/[\\/]/).pop() || filePath;

      const [tree, lines] = await invoke<[JsonNode, VisibleLine[]]>(
        "json_open_file",
        { path: filePath }
      );

      setJsonFile(filePath, fileName, tree, lines);
      setJsonValidationError(null);
    } catch (e) {
      message.error(`打开文件失败: ${e}`);
    }
  };

  const handleSave = async () => {
    if (!jsonPath) return;
    try {
      const text = await invoke<string>("json_get_formatted_text");
      await invoke("json_save", { path: jsonPath, content: text });
      message.success("保存成功");
    } catch (e) {
      message.error(`保存失败: ${e}`);
    }
  };

  const handleSaveAs = async () => {
    try {
      const text = await invoke<string>("json_get_formatted_text");
      const outputPath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: jsonFileName || "untitled.json",
      });
      if (!outputPath) return;
      await invoke("json_save", { path: outputPath, content: text });
      message.success("另存为成功");
    } catch (e) {
      message.error(`另存为失败: ${e}`);
    }
  };

  const handleFormat = async () => {
    if (!jsonPath) return;
    try {
      const text = await invoke<string>("json_get_formatted_text");
      await invoke("json_save", { path: jsonPath, content: text });
      message.success("已格式化并保存");
    } catch (e) {
      message.error(`格式化失败: ${e}`);
    }
  };

  const handleMinify = async () => {
    if (!jsonPath) return;
    try {
      const text = await invoke<string>("json_get_formatted_text");
      const minified = await invoke<string>("json_minify", { content: text });
      await invoke("json_save", { path: jsonPath, content: minified });
      message.success("已压缩并保存");
    } catch (e) {
      message.error(`压缩失败: ${e}`);
    }
  };

  const handleValidate = async () => {
    try {
      const text = await invoke<string>("json_get_formatted_text");
      const result = await invoke<JsonValidationResult>(
        "json_validate",
        { content: text }
      );
      setJsonValidationError(result);
      if (result.valid) {
        message.success("JSON 语法正确");
      } else {
        message.warning(
          `语法错误 (行 ${result.error_line}, 列 ${result.error_column}): ${result.error_message}`
        );
      }
    } catch (e) {
      message.error(`校验失败: ${e}`);
    }
  };

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Space>
        <Tooltip title="选择文件">
          <Button icon={<FolderOpenOutlined />} onClick={handleOpenFile}>
            选择文件
          </Button>
        </Tooltip>
        <Tooltip title="保存">
          <Button
            icon={<SaveOutlined />}
            onClick={handleSave}
            disabled={!isJsonLoaded}
          >
            保存
          </Button>
        </Tooltip>
        <Tooltip title="另存为">
          <Button
            icon={<FileAddOutlined />}
            onClick={handleSaveAs}
            disabled={!isJsonLoaded}
          >
            另存为
          </Button>
        </Tooltip>
        <div
          style={{
            width: 1,
            height: 24,
            background: "#d9d9d9",
            margin: "0 4px",
          }}
        />
        <Tooltip title="格式化 (Pretty Print)">
          <Button
            icon={<AlignLeftOutlined />}
            onClick={handleFormat}
            disabled={!isJsonLoaded}
          >
            格式化
          </Button>
        </Tooltip>
        <Tooltip title="压缩为单行">
          <Button
            icon={<ShrinkOutlined />}
            onClick={handleMinify}
            disabled={!isJsonLoaded}
          >
            压缩
          </Button>
        </Tooltip>
        <Tooltip title="语法校验">
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={handleValidate}
            disabled={!isJsonLoaded}
          >
            校验
          </Button>
        </Tooltip>
      </Space>
    </div>
  );
};

export default JsonToolbar;
