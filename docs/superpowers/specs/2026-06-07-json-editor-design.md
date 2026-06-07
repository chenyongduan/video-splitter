# JSON 编辑器设计文档

**日期：** 2026-06-07
**状态：** 已批准

## 概述

为 MediaKit 新增 JSON 工具 tab，提供 JSON 文件的查看、编辑、格式化、压缩和语法校验功能。采用 Rust 处理全部数据逻辑（解析、树结构、折叠、格式化、校验），前端只负责轻量渲染和事件转发的方案。

## 目标

- 结构化树形编辑 JSON（点击节点进入编辑）
- JSON 对象/数组的独立折叠/展开
- 格式化（pretty print）、压缩（minify）、语法校验
- 保存/另存为
- 主要处理 < 5MB 的 JSON 文件

## 架构

### 整体方案：Rust Tauri 命令 + 前端轻量渲染

Rust 端负责：JSON 解析、树结构构建、折叠范围计算、格式化、压缩、语法校验、文件 I/O。
前端负责：渲染可见行列表、捕获用户交互、调用 Rust 命令。

数据流：`用户操作 → 前端 invoke Rust 命令 → Rust 处理并返回结果 → 前端重新渲染`

### Rust 后端

#### 文件结构

```
src-tauri/src/
├── lib.rs              — 注册 json_editor 模块
└── json_editor.rs      — JSON 编辑器全部 Rust 逻辑（新文件）
```

#### 依赖

```toml
serde_json = "1"  # JSON 解析和序列化（serde/tauri 已有）
```

#### 核心数据结构

```rust
struct JsonNode {
    key: Option<String>,        // 字段名（数组元素为 None）
    value_type: String,         // "object" | "array" | "string" | "number" | "boolean" | "null"
    value: Option<String>,      // 叶子节点的原始值
    children: Vec<JsonNode>,    // object/array 的子节点
    line_start: u32,            // 格式化文本中的起始行号
    line_end: u32,              // 格式化文本中的结束行号
    collapsed: bool,            // 当前是否折叠
    depth: u32,                 // 嵌套层级（控制缩进）
}

struct VisibleLine {
    line_number: u32,
    content: String,            // 这行的显示内容
    node_path: Option<String>,  // 节点路径（用于定位编辑）
    is_collapsible: bool,       // 是否可折叠（对象/数组的开始行）
    collapsed: bool,            // 当前是否折叠
    depth: u32,                 // 缩进层级
}

struct ValidationResult {
    valid: bool,
    error_message: Option<String>,
    error_line: Option<u32>,
    error_column: Option<u32>,
}
```

#### Tauri 命令

| 命令 | 输入 | 输出 | 逻辑 |
|------|------|------|------|
| `json_open_file` | `path: String` | `(Vec<JsonNode>, Vec<VisibleLine>)` | 读文件 → 解析 → 构建树 → 生成可见行 |
| `json_toggle_collapse` | `node_path: String` | `Vec<VisibleLine>` | 切换折叠状态 → 重新计算可见行 |
| `json_update_node` | `node_path: String`, `new_value: String` | `(Vec<JsonNode>, Vec<VisibleLine>)` | 修改节点值 → 重新解析 → 返回新树+可见行 |
| `json_format` | `content: String` | `String` | 美化格式化（4空格缩进） |
| `json_minify` | `content: String` | `String` | 压缩为单行 |
| `json_validate` | `content: String` | `ValidationResult` | 校验语法，返回错误位置 |
| `json_save` | `path: String`, `content: String` | `()` | 写入文件 |
| `json_get_formatted_text` | — | `String` | 从当前树生成完整格式化文本 |

#### Rust 端全局状态

```rust
struct JsonEditorState {
    root: Option<JsonNode>,           // 当前 JSON 树
    formatted_text: Option<String>,   // 格式化后的完整文本
    file_path: Option<String>,        // 当前文件路径
    collapsed_nodes: HashSet<String>, // 已折叠的节点路径集合
}
```

通过 `State<JsonEditorState>` 管理，避免每次交互传整棵树。

#### 关键算法

1. **解析为树**：递归遍历 `serde_json::Value`，为每个节点计算 `line_start` / `line_end` / `depth`
2. **生成可见行**：遍历树，遇到 `collapsed=true` 的节点跳过子节点，只输出起始行和 `...` + 结束行
3. **折叠切换**：修改 `collapsed_nodes` 集合，重新生成可见行
4. **编辑节点**：修改树中对应节点值，从树重新序列化为 JSON 字符串，再重新解析保证一致性

### 前端

#### 文件结构

```
src/pages/json/
├── index.tsx          — 页面入口，管理整体布局
├── JsonToolbar.tsx    — 顶部操作按钮区
└── JsonTreeView.tsx   — 树形 JSON 查看器/编辑器
```

#### 页面布局

```
┌──────────────────────────────────────────────┐
│  JsonToolbar                                  │
│  [选择文件] [保存] [另存为] [格式化] [压缩] [校验] │
├──────┬───────────────────────────────────────┤
│ 行号  │  JsonTreeView                         │
│      │                                       │
│  1   │  {                                     │
│  2   │    "name": "MediaKit",         ✏️ 🔽   │
│  3   │    "version": "0.2.0",         ✏️      │
│  4   │    ▶ "dependencies": { ... }   🔽     │
│  5   │    "description": "..."        ✏️      │
│  6   │  }                                     │
│      │                                       │
└──────┴───────────────────────────────────────┤
```

#### 交互设计

- **折叠/展开**：点击对象/数组前的 ▶/🔽 图标，调用 Rust 的 `json_toggle_collapse`，返回新的可见行数据
- **编辑值**：点击值右侧的 ✏️ 图标，弹出行内输入框，确认后调用 `json_update_node` 更新
- **行号**：根据当前可见行动态计算，跟随折叠状态变化
- **语法错误**：校验失败时在对应行显示红色波浪线和错误提示
- **拖拽**：支持拖拽 .json 文件到页面直接打开

#### 工具栏按钮

| 按钮 | 功能 | 调用链 |
|------|------|--------|
| 选择文件 | 打开文件对话框 | `dialog::open` → `json_open_file` |
| 保存 | 保存回原文件 | `json_get_formatted_text` → `json_save` |
| 另存为 | 弹出保存对话框 | `dialog::save` → `json_save` |
| 格式化 | Pretty print | `json_format` → 刷新显示 |
| 压缩 | Minify | `json_minify` → 刷新显示 |
| 校验 | 语法检查 | `json_validate` → 标记错误行 |

#### Store 扩展

在 `segmentStore.ts` 中新增 JSON 域，遵循现有命名模式：

```typescript
// 状态
jsonPath / jsonFileName / isJsonLoaded / jsonTree / jsonFormattedText
/ jsonCollapsedNodes / jsonValidationError

// 操作
setJsonFile / clearJson / setJsonTree / toggleJsonCollapse
/ setJsonValidationError
```

#### App.tsx 修改

- `AppTab` 类型新增 `"json"`
- Tabs 组件新增 `{ key: "json", label: "JSON工具" }`
- 条件渲染 `<JsonPage />`

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 文件不存在 / 无读取权限 | Rust 返回错误，前端 `message.error` 提示 |
| JSON 语法错误 | `json_validate` 返回错误行号+列号+描述，前端对应行标红 |
| 文件过大（> 5MB） | Rust 检测文件大小，返回警告，前端弹出确认对话框 |
| 非JSON文件 | 解析失败，提示"无法解析，请选择有效的JSON文件" |
| 保存时文件被占用 | Rust 返回 IO 错误，提示"文件被占用，请关闭后重试" |
| 编辑值不合法 | Rust 端即时校验，拒绝修改并返回错误信息 |

## 不包含（后续迭代）

- 撤销/重做
- 搜索/替换
- JSON Schema 校验
- 大文件（> 5MB）的虚拟滚动优化
- JSON Path 查询
