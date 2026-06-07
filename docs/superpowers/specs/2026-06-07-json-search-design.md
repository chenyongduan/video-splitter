# JSON 编辑器搜索功能设计

日期: 2026-06-07

## 概述

为 JSON 编辑器页面添加全文搜索功能，支持正则表达式和字符串搜索，快捷键唤出搜索栏，搜索结果在树视图中高亮并在底部面板展示。

## 交互流程

### 快捷键

| 快捷键 | 行为 |
|--------|------|
| `Cmd+F` / `Ctrl+F` | 打开搜索栏，聚焦输入框 |
| `Cmd+D` / `Ctrl+D` | 跳转到下一个匹配项（搜索栏打开时） |
| `Escape` | 关闭搜索栏和底部面板 |
| `Enter` | 执行搜索（搜索栏聚焦时） |

### 搜索栏 UI

- 位置：`JsonTreeView` 内部顶部，覆盖在树视图上方，类似 VS Code 搜索条
- 高度 40px，白色背景，底部 1px 阴影
- 组成：输入框 + 工具按钮组 + 匹配计数 + 导航按钮 + 关闭按钮
- 工具按钮：大小写 (Aa) | 全词匹配 (Ab) | 正则表达式 (.*)
- 匹配计数显示 `3/20` 格式，无匹配时红色
- 按钮实时切换模式并自动重新搜索

### 底部结果面板

- 位置：树视图底部，搜索完成后弹出
- 默认高度 200px，可拖拽调整（min 100px, max 400px）
- 半透明背景 `rgba(255,255,255,0.95)`，顶部 1px 边框
- 每条结果一行：行号 + 缩略内容（匹配词高亮）
- 被折叠隐藏的结果灰显，点击时先展开再跳转
- 有拖拽条和关闭按钮

### 树视图中的高亮

- 当前匹配项：`#f5a623`（橙色）背景
- 其他匹配项：`#ffe58f`（黄色）背景
- 高亮优先级：当前匹配 > 其他匹配 > 错误行背景

## Rust 后端

### 新增 `json_search` 命令

```rust
#[tauri::command]
pub fn json_search(
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
    state: State<'_, Mutex<JsonEditorState>>,
) -> Result<Vec<SearchResult>, String>
```

**搜索逻辑：**
- 临时忽略折叠状态，以完全展开的方式遍历所有可视行（`collapsed` 为空集）
- 对每行的 `content` 做文本匹配（正则或字符串）
- 支持大小写敏感、全词匹配、正则表达式三种模式

### `SearchResult` 结构

```rust
#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub expanded_line: u32,    // 全展开时的行号
    pub visible_line: u32,     // 当前折叠状态下的可视行号（0 = 被折叠隐藏）
    pub content: String,       // 该行完整内容
    pub match_start: u32,      // 匹配起始位置（字符偏移）
    pub match_end: u32,        // 匹配结束位置（字符偏移）
}
```

### 行号映射

- 搜索在全展开状态下进行，得到 `expanded_line`
- 通过对比全展开行号序列与当前折叠状态下的可视行号序列，计算出 `visible_line`
- 如果匹配行在折叠容器内部，`visible_line = 0`，前端标记为隐藏

## 前端组件

### 新增文件

```
src/pages/json/
├── JsonSearchBar.tsx       — 搜索栏 UI（输入框 + 工具按钮 + 导航）
└── JsonSearchResults.tsx   — 底部结果面板（可滚动列表）
```

### 状态管理

搜索状态使用 React local state（在 `JsonTreeView` 中），不放入 Zustand 全局 store：

- `searchOpen: boolean` — 搜索栏是否打开
- `searchQuery: string` — 当前搜索词
- `searchResults: SearchResult[]` — 搜索结果列表
- `currentMatchIndex: number` — 当前高亮的匹配索引
- `caseSensitive: boolean` — 大小写敏感
- `wholeWord: boolean` — 全词匹配
- `useRegex: boolean` — 正则表达式

通过 props 传递给 `JsonSearchBar` 和 `JsonSearchResults`。

### 高亮渲染

在 `JsonTreeView` 的行渲染中，检查当前行是否有匹配结果：
- 使用 `<span style={{ background: ... }}>` 包裹匹配片段
- 当前跳转到的匹配项用橙色背景，其他用黄色背景
- 需要修改 `renderLineContent` 函数，接受匹配信息参数

### 跳转逻辑

- `Cmd+D` 跳转下一个：`currentMatchIndex++`
- 如果目标行 `visible_line > 0`，直接 `scrollTop = (visible_line - 1) * LINE_HEIGHT`
- 如果目标行 `visible_line === 0`（被折叠），先调用 `json_toggle_collapse` 展开父节点，然后重新搜索获取新的 `visible_line`，再跳转

### 快捷键处理

在 `JsonTreeView` 组件中通过 `useEffect` + `keydown` 事件监听，仅在 JSON 文件已加载时生效。阻止默认浏览器搜索行为（`e.preventDefault()`）。

## 依赖

- `regex` crate（Rust 端正则表达式支持）— 需添加到 `Cargo.toml`
- 无新增前端依赖
