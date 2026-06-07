# JSON 编辑器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MediaKit 新增 JSON 工具 tab，支持 JSON 文件的查看、结构化树形编辑、折叠/展开、格式化、压缩、语法校验和保存。

**Architecture:** Rust 后端（`src-tauri/src/json_editor.rs`）负责全部 JSON 解析、树结构构建、折叠范围计算、格式化/压缩/校验和文件 I/O，通过 Tauri 命令暴露给前端。前端只负责渲染可见行列表和捕获用户交互。这是项目中第一个使用 Rust 自定义命令的功能。

**Tech Stack:** Rust (serde_json, Tauri v2 commands), React 19, Ant Design 6, Zustand 5

**Note:** 项目当前无测试基础设施，所有任务以实现+构建验证为主。

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src-tauri/src/json_editor.rs` | Rust JSON 编辑器全部逻辑：数据结构、解析、树构建、可见行生成、Tauri 命令 |
| Modify | `src-tauri/src/lib.rs` | 注册 json_editor 模块和 invoke_handler |
| Modify | `src/types/index.ts` | 新增 JSON 相关类型定义，扩展 AppTab |
| Modify | `src/store/segmentStore.ts` | 新增 JSON 域状态和 actions |
| Create | `src/pages/json/index.tsx` | JSON 页面入口组件 |
| Create | `src/pages/json/JsonToolbar.tsx` | 顶部操作按钮栏 |
| Create | `src/pages/json/JsonTreeView.tsx` | 树形 JSON 查看/编辑器 |
| Modify | `src/App.tsx` | 新增 JSON tab |

---

### Task 1: Rust Backend — Data Structures and State

**Files:**
- Create: `src-tauri/src/json_editor.rs`

This task creates the Rust module with all data structures and the global state type.

- [ ] **Step 1: Create `src-tauri/src/json_editor.rs` with data structures**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::sync::Mutex;
use tauri::State;

/// JSON 树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonNode {
    /// 字段名（数组元素为 None）
    pub key: Option<String>,
    /// "object" | "array" | "string" | "number" | "boolean" | "null"
    pub value_type: String,
    /// 叶子节点的原始值字符串
    pub value: Option<String>,
    /// object / array 的子节点
    pub children: Vec<JsonNode>,
    /// 嵌套深度（用于缩进）
    pub depth: u32,
    /// 节点路径（如 "root.name", "root.dependencies.0"）
    pub path: String,
}

/// 传给前端渲染的单行数据
#[derive(Debug, Clone, Serialize)]
pub struct VisibleLine {
    /// 1-based 行号
    pub line_number: u32,
    /// 显示内容（已含缩进）
    pub content: String,
    /// 节点路径（用于定位编辑/折叠）
    pub node_path: String,
    /// 是否可折叠（object / array）
    pub is_collapsible: bool,
    /// 当前是否折叠
    pub collapsed: bool,
    /// 缩进层级
    pub depth: u32,
    /// 是否可编辑（叶子节点的值行）
    pub is_editable: bool,
}

/// 校验结果
#[derive(Debug, Clone, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub error_message: Option<String>,
    pub error_line: Option<u32>,
    pub error_column: Option<u32>,
}

/// Rust 端全局状态
pub struct JsonEditorState {
    /// 当前 JSON 树
    pub root: Option<JsonNode>,
    /// 当前文件路径
    pub file_path: Option<String>,
    /// 已折叠的节点路径集合
    pub collapsed_nodes: HashSet<String>,
}

impl Default for JsonEditorState {
    fn default() -> Self {
        Self {
            root: None,
            file_path: None,
            collapsed_nodes: HashSet::new(),
        }
    }
}
```

- [ ] **Step 2: Build to verify compilation**

Run: `cd D:/projects/video-splitter && pnpm tauri build --debug 2>&1 | head -20`

Expected: Build may fail because module is not yet registered in lib.rs — that's OK. We just need `json_editor.rs` itself to have no syntax errors. Alternatively run `cd D:/projects/video-splitter/src-tauri && cargo check` to verify just the Rust compilation.

Actually, at this stage the file is not yet imported. Skip build verification for this step — it will be verified in Task 2.

---

### Task 2: Rust Backend — Parsing and Tree Building Logic

**Files:**
- Modify: `src-tauri/src/json_editor.rs`

Add the core functions for parsing JSON into the tree structure and generating visible lines.

- [ ] **Step 1: Add parsing and rendering functions to `json_editor.rs`**

Append these functions after the data structures in `json_editor.rs`:

```rust
/// 将 serde_json::Value 递归转换为 JsonNode 树
fn value_to_node(value: &serde_json::Value, key: Option<String>, depth: u32, path: &str) -> JsonNode {
    match value {
        serde_json::Value::Object(map) => {
            let mut children = Vec::new();
            for (k, v) in map {
                let child_path = format!("{}.{}", path, k);
                children.push(value_to_node(v, Some(k.clone()), depth + 1, &child_path));
            }
            JsonNode {
                key,
                value_type: "object".to_string(),
                value: None,
                children,
                depth,
                path: path.to_string(),
            }
        }
        serde_json::Value::Array(arr) => {
            let mut children = Vec::new();
            for (i, v) in arr.iter().enumerate() {
                let child_path = format!("{}.{}", path, i);
                children.push(value_to_node(v, None, depth + 1, &child_path));
            }
            JsonNode {
                key,
                value_type: "array".to_string(),
                value: None,
                children,
                depth,
                path: path.to_string(),
            }
        }
        serde_json::Value::String(s) => JsonNode {
            key,
            value_type: "string".to_string(),
            value: Some(format!("\"{}\"", s)),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
        serde_json::Value::Number(n) => JsonNode {
            key,
            value_type: "number".to_string(),
            value: Some(n.to_string()),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
        serde_json::Value::Bool(b) => JsonNode {
            key,
            value_type: "boolean".to_string(),
            value: Some(b.to_string()),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
        serde_json::Value::Null => JsonNode {
            key,
            value_type: "null".to_string(),
            value: Some("null".to_string()),
            children: Vec::new(),
            depth,
            path: path.to_string(),
        },
    }
}

/// 生成缩进字符串
fn indent(depth: u32) -> String {
    "  ".repeat(depth as usize)
}

/// 格式化 key 部分（带引号和冒号）
fn format_key_line(key: &Option<String>, depth: u32) -> String {
    match key {
        Some(k) => format!("{}\"{}\": ", indent(depth), k),
        None => indent(depth),
    }
}

/// 递归生成可见行列表
fn generate_visible_lines(
    node: &JsonNode,
    collapsed: &HashSet<String>,
    lines: &mut Vec<VisibleLine>,
    line_num: &mut u32,
) {
    let is_collapsed = collapsed.contains(&node.path);

    match node.value_type.as_str() {
        "object" => {
            if is_collapsed {
                *line_num += 1;
                let child_count = node.children.len();
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}{{ ... }} // {} items", format_key_line(&node.key, node.depth), child_count),
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: true,
                    depth: node.depth,
                    is_editable: false,
                });
            } else {
                // Opening line
                *line_num += 1;
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}{{", format_key_line(&node.key, node.depth)),
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });

                // Children
                for child in &node.children {
                    generate_visible_lines(child, collapsed, lines, line_num);
                }

                // Closing line
                *line_num += 1;
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}}}", indent(node.depth)),
                    node_path: node.path.clone(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });
            }
        }
        "array" => {
            if is_collapsed {
                *line_num += 1;
                let child_count = node.children.len();
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}[ ... ] // {} items", format_key_line(&node.key, node.depth), child_count),
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: true,
                    depth: node.depth,
                    is_editable: false,
                });
            } else {
                *line_num += 1;
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}[", format_key_line(&node.key, node.depth)),
                    node_path: node.path.clone(),
                    is_collapsible: true,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });

                for child in &node.children {
                    generate_visible_lines(child, collapsed, lines, line_num);
                }

                *line_num += 1;
                lines.push(VisibleLine {
                    line_number: *line_num,
                    content: format!("{}]", indent(node.depth)),
                    node_path: node.path.clone(),
                    is_collapsible: false,
                    collapsed: false,
                    depth: node.depth,
                    is_editable: false,
                });
            }
        }
        _ => {
            // Leaf node: "key": value
            *line_num += 1;
            lines.push(VisibleLine {
                line_number: *line_num,
                content: format!("{}{}", format_key_line(&node.key, node.depth), node.value.as_deref().unwrap_or("null")),
                node_path: node.path.clone(),
                is_collapsible: false,
                collapsed: false,
                depth: node.depth,
                is_editable: true,
            });
        }
    }
}

/// 从树生成全部可见行
pub fn build_visible_lines(root: &JsonNode, collapsed: &HashSet<String>) -> Vec<VisibleLine> {
    let mut lines = Vec::new();
    let mut line_num = 0u32;
    generate_visible_lines(root, collapsed, &mut lines, &mut line_num);
    lines
}

/// 解析 JSON 字符串为树
pub fn parse_json(content: &str) -> Result<JsonNode, String> {
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("{}", e))?;
    Ok(value_to_node(&value, None, 0, "root"))
}

/// 从 JsonNode 树重新构建 serde_json::Value（用于序列化）
fn node_to_value(node: &JsonNode) -> serde_json::Value {
    match node.value_type.as_str() {
        "object" => {
            let mut map = serde_json::Map::new();
            for child in &node.children {
                let key = child.key.clone().unwrap_or_default();
                map.insert(key, node_to_value(child));
            }
            serde_json::Value::Object(map)
        }
        "array" => {
            let arr: Vec<serde_json::Value> = node.children.iter().map(node_to_value).collect();
            serde_json::Value::Array(arr)
        }
        "string" => {
            // 去掉外层引号
            let s = node.value.as_deref().unwrap_or("\"\"");
            let trimmed = s.strip_prefix('"').and_then(|s| s.strip_suffix('"')).unwrap_or("");
            serde_json::Value::String(trimmed.to_string())
        }
        "number" => {
            let s = node.value.as_deref().unwrap_or("0");
            if let Ok(n) = s.parse::<i64>() {
                serde_json::Value::Number(n.into())
            } else if let Ok(f) = s.parse::<f64>() {
                serde_json::Number::from_f64(f).map(serde_json::Value::Number).unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Number(0.into())
            }
        }
        "boolean" => {
            let b = node.value.as_deref() == Some("true");
            serde_json::Value::Bool(b)
        }
        _ => serde_json::Value::Null,
    }
}

/// 根据路径更新树中某个节点的值
fn update_node_by_path(node: &mut JsonNode, path: &str, new_value: &str) -> Result<(), String> {
    if node.path == path {
        // This is the target node — try to parse the new value
        let parsed: serde_json::Value = serde_json::from_str(new_value)
            .map_err(|e| format!("无效的 JSON 值: {}", e))?;
        let new_node = value_to_node(&parsed, node.key.clone(), node.depth, &node.path);
        *node = new_node;
        return Ok(());
    }

    for child in &mut node.children {
        if path.starts_with(&child.path) || child.path == path {
            let result = update_node_by_path(child, path, new_value);
            if result.is_ok() {
                return Ok(());
            }
        }
    }

    Err(format!("未找到路径: {}", path))
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/json_editor.rs
git commit -m "feat(json): add Rust data structures and parsing logic"
```

---

### Task 3: Rust Backend — Tauri Commands

**Files:**
- Modify: `src-tauri/src/json_editor.rs` (append Tauri commands)
- Modify: `src-tauri/src/lib.rs` (register module and commands)

- [ ] **Step 1: Append Tauri command functions to `json_editor.rs`**

Add these commands at the end of `json_editor.rs`:

```rust
#[tauri::command]
pub fn json_open_file(path: String, state: State<'_, Mutex<JsonEditorState>>) -> Result<(JsonNode, Vec<VisibleLine>), String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let root = parse_json(&content)?;
    let mut state = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    state.file_path = Some(path);
    state.collapsed_nodes.clear();

    let lines = build_visible_lines(&root, &state.collapsed_nodes);
    state.root = Some(root.clone());

    Ok((root, lines))
}

#[tauri::command]
pub fn json_toggle_collapse(node_path: String, state: State<'_, Mutex<JsonEditorState>>) -> Result<Vec<VisibleLine>, String> {
    let mut state = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;

    if state.collapsed_nodes.contains(&node_path) {
        state.collapsed_nodes.remove(&node_path);
    } else {
        state.collapsed_nodes.insert(node_path);
    }

    let root = state.root.as_ref().ok_or("未加载 JSON 文件")?;
    Ok(build_visible_lines(root, &state.collapsed_nodes))
}

#[tauri::command]
pub fn json_update_node(node_path: String, new_value: String, state: State<'_, Mutex<JsonEditorState>>) -> Result<(JsonNode, Vec<VisibleLine>), String> {
    let mut state = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;

    let root = state.root.as_mut().ok_or("未加载 JSON 文件")?;
    update_node_by_path(root, &node_path, &new_value)?;

    let lines = build_visible_lines(root, &state.collapsed_nodes);
    Ok((root.clone(), lines))
}

#[tauri::command]
pub fn json_format(content: String) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;
    serde_json::to_string_pretty(&value)
        .map_err(|e| format!("格式化失败: {}", e))
}

#[tauri::command]
pub fn json_minify(content: String) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;
    serde_json::to_string(&value)
        .map_err(|e| format!("压缩失败: {}", e))
}

#[tauri::command]
pub fn json_validate(content: String) -> Result<ValidationResult, String> {
    match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(_) => Ok(ValidationResult {
            valid: true,
            error_message: None,
            error_line: None,
            error_column: None,
        }),
        Err(e) => {
            let line = e.line();
            let column = e.column();
            let msg = e.to_string();
            Ok(ValidationResult {
                valid: false,
                error_message: Some(msg),
                error_line: Some(line as u32),
                error_column: Some(column as u32),
            })
        }
    }
}

#[tauri::command]
pub fn json_save(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("保存文件失败: {}", e))
}

#[tauri::command]
pub fn json_get_formatted_text(state: State<'_, Mutex<JsonEditorState>>) -> Result<String, String> {
    let state = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    let root = state.root.as_ref().ok_or("未加载 JSON 文件")?;
    let value = node_to_value(root);
    serde_json::to_string_pretty(&value)
        .map_err(|e| format!("序列化失败: {}", e))
}
```

- [ ] **Step 2: Register module and commands in `lib.rs`**

Replace the entire content of `src-tauri/src/lib.rs` with:

```rust
mod json_editor;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(json_editor::JsonEditorState::default()))
        .invoke_handler(tauri::generate_handler![
            json_editor::json_open_file,
            json_editor::json_toggle_collapse,
            json_editor::json_update_node,
            json_editor::json_format,
            json_editor::json_minify,
            json_editor::json_validate,
            json_editor::json_save,
            json_editor::json_get_formatted_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Build to verify Rust compilation**

Run: `cd D:/projects/video-splitter/src-tauri && cargo check 2>&1`

Expected: Compiled successfully with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/json_editor.rs src-tauri/src/lib.rs
git commit -m "feat(json): add Rust Tauri commands for JSON editing"
```

---

### Task 4: Frontend — TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add JSON types to `src/types/index.ts`**

Append the following at the end of the file, and update the `AppTab` type:

At the top of the file, change the `AppTab` type:
```typescript
export type AppTab = "video" | "audio" | "image" | "icon" | "json";
```

Append at end of file:
```typescript
// ==================== JSON ====================

export interface JsonNode {
  key: string | null;
  value_type: "object" | "array" | "string" | "number" | "boolean" | "null";
  value: string | null;
  children: JsonNode[];
  depth: number;
  path: string;
}

export interface VisibleLine {
  line_number: number;
  content: string;
  node_path: string;
  is_collapsible: boolean;
  collapsed: boolean;
  depth: number;
  is_editable: boolean;
}

export interface JsonValidationResult {
  valid: boolean;
  error_message: string | null;
  error_line: number | null;
  error_column: number | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(json): add TypeScript types for JSON editor"
```

---

### Task 5: Frontend — Zustand Store Extension

**Files:**
- Modify: `src/store/segmentStore.ts`

- [ ] **Step 1: Add JSON state and actions to the store**

Add `JsonNode`, `VisibleLine`, `JsonValidationResult` to the imports from `../types`.

Add the following state fields inside the `create` function (follow the existing pattern, after the icon domain):

```typescript
// JSON
jsonPath: null as string | null,
jsonFileName: null as string | null,
isJsonLoaded: false,
jsonTree: null as JsonNode | null,
jsonVisibleLines: [] as VisibleLine[],
jsonValidationError: null as JsonValidationResult | null,
```

Add the following actions:

```typescript
setJsonFile: (path: string, fileName: string, tree: JsonNode, visibleLines: VisibleLine[]) => {
    set({
        jsonPath: path,
        jsonFileName: fileName,
        isJsonLoaded: true,
        jsonTree: tree,
        jsonVisibleLines: visibleLines,
        jsonValidationError: null,
    });
},
clearJson: () => {
    set({
        jsonPath: null,
        jsonFileName: null,
        isJsonLoaded: false,
        jsonTree: null,
        jsonVisibleLines: [],
        jsonValidationError: null,
    });
},
setJsonTree: (tree: JsonNode, visibleLines: VisibleLine[]) => {
    set({
        jsonTree: tree,
        jsonVisibleLines: visibleLines,
    });
},
setJsonVisibleLines: (visibleLines: VisibleLine[]) => {
    set({ jsonVisibleLines: visibleLines });
},
setJsonValidationError: (result: JsonValidationResult | null) => {
    set({ jsonValidationError: result });
},
```

- [ ] **Step 2: Commit**

```bash
git add src/store/segmentStore.ts
git commit -m "feat(json): add JSON state and actions to Zustand store"
```

---

### Task 6: Frontend — JsonToolbar Component

**Files:**
- Create: `src/pages/json/JsonToolbar.tsx`

- [ ] **Step 1: Create the toolbar component**

```tsx
import React from "react";
import { Button, Space, Tooltip, message } from "antd";
import {
  FolderOpenOutlined,
  SaveOutlined,
  SaveFilled,
  AlignLeftOutlined,
  CompressOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/segmentStore";

const JsonToolbar: React.FC = () => {
  const {
    jsonPath,
    jsonFileName,
    isJsonLoaded,
    setJsonFile,
    setJsonTree,
    setJsonVisibleLines,
    setJsonValidationError,
    clearJson,
    jsonTree,
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

      const [tree, lines] = await invoke<[import("../../types").JsonNode, import("../../types").VisibleLine[]]>(
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
    try {
      const text = await invoke<string>("json_get_formatted_text");
      const formatted = await invoke<string>("json_format", { content: text });
      // 重新解析以刷新树
      const tree = await invoke<import("../../types").JsonNode>("_json_parse_content", { content: formatted });
      // 实际上直接用 format 返回的重新 open 更简单
      // 但我们需要保持 Rust 状态同步
      // 改用重新 open 原始路径的方式
      if (jsonPath) {
        const [newTree, lines] = await invoke<[import("../../types").JsonNode, import("../../types").VisibleLine[]]>(
          "json_open_file",
          { path: jsonPath }
        );
        setJsonTree(newTree, lines);
      }
      message.success("格式化完成");
    } catch (e) {
      message.error(`格式化失败: ${e}`);
    }
  };

  const handleMinify = async () => {
    try {
      const text = await invoke<string>("json_get_formatted_text");
      const minified = await invoke<string>("json_minify", { content: text });
      // 保存压缩后的内容到原文件并重新加载
      if (jsonPath) {
        await invoke("json_save", { path: jsonPath, content: minified });
        const [newTree, lines] = await invoke<[import("../../types").JsonNode, import("../../types").VisibleLine[]]>(
          "json_open_file",
          { path: jsonPath }
        );
        setJsonTree(newTree, lines);
      }
      message.success("压缩完成");
    } catch (e) {
      message.error(`压缩失败: ${e}`);
    }
  };

  const handleValidate = async () => {
    try {
      const text = await invoke<string>("json_get_formatted_text");
      const result = await invoke<import("../../types").JsonValidationResult>(
        "json_validate",
        { content: text }
      );
      setJsonValidationError(result);
      if (result.valid) {
        message.success("JSON 语法正确");
      } else {
        message.warning(`语法错误 (行 ${result.error_line}): ${result.error_message}`);
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
            icon={<SaveFilled />}
            onClick={handleSaveAs}
            disabled={!isJsonLoaded}
          >
            另存为
          </Button>
        </Tooltip>
        <div style={{ width: 1, height: 24, background: "#d9d9d9", margin: "0 4px" }} />
        <Tooltip title="格式化">
          <Button
            icon={<AlignLeftOutlined />}
            onClick={handleFormat}
            disabled={!isJsonLoaded}
          >
            格式化
          </Button>
        </Tooltip>
        <Tooltip title="压缩">
          <Button
            icon={<CompressOutlined />}
            onClick={handleMinify}
            disabled={!isJsonLoaded}
          >
            压缩
          </Button>
        </Tooltip>
        <Tooltip title="语法校验">
          <Button
            icon={<CheckCircleOutlined />}
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
```

Wait — `handleFormat` has a logic issue. Formatting doesn't change the file, it just re-displays. Let me simplify. The tree is already parsed from the formatted content. Format/Minify should save to file and reload. Let me rewrite the toolbar with corrected logic.

Actually, re-reading the spec: "格式化" pretty-prints the JSON (4-space indent), "压缩" minifies to single line. Both operate on the current in-memory tree and save the result. The display always shows the tree view.

Let me revise the handleFormat:

```typescript
const handleFormat = async () => {
  if (!jsonPath) return;
  try {
    const text = await invoke<string>("json_get_formatted_text");
    // The formatted text is already pretty-printed; save and reload
    await invoke("json_save", { path: jsonPath, content: text });
    const [newTree, lines] = await invoke<[JsonNode, VisibleLine[]]>(
      "json_open_file",
      { path: jsonPath }
    );
    setJsonTree(newTree, lines);
    message.success("格式化完成");
  } catch (e) {
    message.error(`格式化失败: ${e}`);
  }
};
```

Actually, this is redundant — the display already shows formatted tree. The format/minify buttons should just save the file in the desired format. Let me rethink.

The simplest approach:
- **格式化**: Save the current tree as pretty-printed JSON to file, reload (display stays the same since tree view is always formatted)
- **压缩**: Save the current tree as minified JSON to file, reload

Since the tree view always shows formatted output, the difference is only in the saved file. But the user expects a visual change. So maybe:
- **格式化**: Save pretty-printed, reload → no visual change in tree, but file is formatted
- **压缩**: Save minified, reload → no visual change in tree, but file is compressed

This feels odd. Better approach: **格式化** and **压缩** buttons modify the saved file format and show a success message. The tree display always shows the structured view.

OK, final corrected toolbar:

```tsx
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
    setJsonTree,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/json/JsonToolbar.tsx
git commit -m "feat(json): add JsonToolbar component"
```

---

### Task 7: Frontend — JsonTreeView Component

**Files:**
- Create: `src/pages/json/JsonTreeView.tsx`

This is the main viewer/editor. It renders visible lines from Rust with line numbers, collapse toggles, and inline editing.

- [ ] **Step 1: Create the tree view component**

```tsx
import React, { useState } from "react";
import { Input, Typography, message } from "antd";
import {
  CaretRightOutlined,
  CaretDownOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import type { JsonNode, VisibleLine } from "../../types";

const JsonTreeView: React.FC = () => {
  const {
    jsonVisibleLines,
    jsonValidationError,
    setJsonTree,
    setJsonVisibleLines,
  } = useAppStore();

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleToggleCollapse = async (nodePath: string) => {
    try {
      const lines = await invoke<VisibleLine[]>("json_toggle_collapse", {
        nodePath,
      });
      setJsonVisibleLines(lines);
    } catch (e) {
      message.error(`折叠操作失败: ${e}`);
    }
  };

  const handleStartEdit = (nodePath: string, currentValue: string) => {
    setEditingPath(nodePath);
    setEditValue(currentValue);
  };

  const handleConfirmEdit = async () => {
    if (!editingPath) return;
    try {
      // new_value 需要是一个合法的 JSON 值
      // 对于字符串，用户输入不带引号，我们自动加上
      const jsonValue = editValue;
      const [tree, lines] = await invoke<[JsonNode, VisibleLine[]]>(
        "json_update_node",
        { nodePath: editingPath, newValue: jsonValue }
      );
      setJsonTree(tree, lines);
      setEditingPath(null);
    } catch (e) {
      message.error(`编辑失败: ${e}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingPath(null);
    setEditValue("");
  };

  const errorLine = jsonValidationError && !jsonValidationError.valid
    ? jsonValidationError.error_line
    : null;

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
        fontSize: 13,
        lineHeight: "22px",
        background: "#fafafa",
      }}
    >
      {jsonVisibleLines.map((line) => {
        const isError = errorLine !== null && line.line_number === errorLine;
        return (
          <div
            key={line.line_number}
            style={{
              display: "flex",
              minHeight: 22,
              background: isError ? "#fff2f0" : "transparent",
              borderBottom: isError ? "1px solid #ffccc7" : "none",
            }}
          >
            {/* 行号 */}
            <div
              style={{
                width: 50,
                minWidth: 50,
                textAlign: "right",
                paddingRight: 12,
                color: "#999",
                userSelect: "none",
                borderRight: "1px solid #e8e8e8",
              }}
            >
              {line.line_number}
            </div>

            {/* 折叠图标 */}
            <div
              style={{
                width: 20,
                minWidth: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {line.is_collapsible && (
                <span
                  onClick={() => handleToggleCollapse(line.node_path)}
                  style={{ cursor: "pointer", color: "#666" }}
                >
                  {line.collapsed ? (
                    <CaretRightOutlined style={{ fontSize: 10 }} />
                  ) : (
                    <CaretDownOutlined style={{ fontSize: 10 }} />
                  )}
                </span>
              )}
            </div>

            {/* 内容区 */}
            <div
              style={{
                flex: 1,
                paddingLeft: 4,
                display: "flex",
                alignItems: "center",
              }}
            >
              {editingPath === line.node_path && line.is_editable ? (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Input
                    size="small"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onPressEnter={handleConfirmEdit}
                    onBlur={handleConfirmEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    style={{ width: 300, fontFamily: "inherit", fontSize: 13 }}
                    autoFocus
                  />
                </span>
              ) : (
                <>
                  <span
                    style={{
                      color: getLineColor(line),
                      whiteSpace: "pre",
                    }}
                  >
                    {renderLineContent(line)}
                  </span>
                  {line.is_editable && (
                    <EditOutlined
                      style={{
                        marginLeft: 8,
                        color: "#bbb",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      onClick={() =>
                        handleStartEdit(line.node_path, extractRawValue(line))
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** 根据内容类型返回颜色 */
function getLineColor(line: VisibleLine): string {
  if (line.is_collapsible) return "#333";
  const content = line.content.trimStart();
  if (content.startsWith('"')) return "#a31515"; // key
  // 检查 value 部分
  const colonIdx = line.content.indexOf(": ");
  if (colonIdx >= 0) {
    const valuePart = line.content.slice(colonIdx + 2).trim();
    if (valuePart.startsWith('"')) return "#0b8a0b"; // string value - green
    if (valuePart === "true" || valuePart === "false") return "#0550ae"; // boolean - blue
    if (valueStartsWithNumber(valuePart)) return "#098658"; // number - teal
  }
  return "#333";
}

function valueStartsWithNumber(s: string): boolean {
  return /^[-]?\d/.test(s);
}

/** 渲染行内容（key 和 value 用不同颜色） */
function renderLineContent(line: VisibleLine): React.ReactNode {
  const colonIdx = line.content.indexOf(": ");
  if (colonIdx < 0) {
    return line.content;
  }
  const keyPart = line.content.slice(0, colonIdx);
  const valuePart = line.content.slice(colonIdx + 2);
  return (
    <>
      <span style={{ color: "#a31515" }}>{keyPart}</span>
      <span style={{ color: "#333" }}>{": "}</span>
      <span style={{ color: getValueColor(valuePart) }}>{valuePart}</span>
    </>
  );
}

function getValueColor(value: string): string {
  if (value.startsWith('"')) return "#0b8a0b";
  if (value === "true" || value === "false") return "#0550ae";
  if (value === "null") return "#8b949e";
  if (/^[-]?\d/.test(value)) return "#098658";
  return "#333";
}

/** 从可见行中提取原始值（去掉 key 部分） */
function extractRawValue(line: VisibleLine): string {
  const colonIdx = line.content.indexOf(": ");
  if (colonIdx < 0) return line.content;
  return line.content.slice(colonIdx + 2);
}

export default JsonTreeView;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/json/JsonTreeView.tsx
git commit -m "feat(json): add JsonTreeView component with collapse and inline editing"
```

---

### Task 8: Frontend — JSON Page Entry

**Files:**
- Create: `src/pages/json/index.tsx`

- [ ] **Step 1: Create the page entry component**

Follow the pattern from image/index.tsx: drag-drop support, loaded/unloaded state.

```tsx
import React, { useCallback } from "react";
import { message } from "antd";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../store/segmentStore";
import JsonToolbar from "./JsonToolbar";
import JsonTreeView from "./JsonTreeView";
import type { JsonNode, VisibleLine } from "../../types";

const JsonPage: React.FC = () => {
  const { isJsonLoaded, clearJson, setJsonFile } = useAppStore();

  const handleFileDrop = useCallback(
    async (paths: string[]) => {
      const path = paths[0];
      if (!path.toLowerCase().endsWith(".json")) {
        message.warning("请拖入 JSON 文件");
        return;
      }
      try {
        const fileName = path.split(/[\\/]/).pop() || path;
        const [tree, lines] = await invoke<[JsonNode, VisibleLine[]]>(
          "json_open_file",
          { path }
        );
        setJsonFile(path, fileName, tree, lines);
      } catch (e) {
        message.error(`打开文件失败: ${e}`);
      }
    },
    [setJsonFile]
  );

  React.useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        handleFileDrop(event.payload.paths);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleFileDrop]);

  if (!isJsonLoaded) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        <div
          style={{
            width: 320,
            height: 200,
            border: "2px dashed #d9d9d9",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontSize: 16,
          }}
        >
          <span style={{ fontSize: 40 }}>📄</span>
          <span>拖拽 JSON 文件到此处</span>
          <span style={{ fontSize: 13, color: "#bbb" }}>
            或使用顶部「选择文件」按钮
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <JsonToolbar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <JsonTreeView />
      </div>
    </div>
  );
};

export default JsonPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/json/index.tsx
git commit -m "feat(json): add JSON page entry with drag-drop support"
```

---

### Task 9: Frontend — App Integration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add JSON tab to App.tsx**

In `src/App.tsx`:

1. Add import for JsonPage:
```typescript
import JsonPage from "./pages/json";
```

2. In the `items` array for `<Tabs>`, add after the icon entry:
```typescript
{ key: "json", label: "JSON工具" },
```

3. In the `<Content>` area, add a conditional render after the icon block:
```typescript
{activeTab === "json" && <JsonPage />}
```

4. In the `useEffect` that restores tab from localStorage, update the includes check:
```typescript
if (saved && ["video", "audio", "image", "icon", "json"].includes(saved)) {
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat(json): integrate JSON tab into App"
```

---

### Task 10: Build Verification and Manual Testing

- [ ] **Step 1: Run full build to verify everything compiles**

Run: `cd D:/projects/video-splitter && pnpm build`

Expected: TypeScript compilation succeeds with no errors.

- [ ] **Step 2: Run Tauri dev to verify the app launches**

Run: `cd D:/projects/video-splitter && pnpm tauri dev`

Expected:
- App window opens
- JSON工具 tab appears in the header
- Clicking the tab shows the drop zone area
- Clicking "选择文件" opens a file dialog filtered for .json files
- Loading a JSON file shows the tree view with line numbers
- Collapse/expand icons work on objects and arrays
- Edit icons appear on leaf values, clicking opens inline input
- Toolbar buttons (保存, 另存为, 格式化, 压缩, 校验) work correctly

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(json): address build and runtime issues"
```
