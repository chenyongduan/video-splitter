# JSON 搜索功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 JSON 编辑器添加全文搜索功能，支持正则/字符串搜索、大小写/全词匹配、快捷键导航、底部结果面板。

**Architecture:** Rust 后端新增 `json_search` 命令，在全展开状态下遍历所有可视行做文本匹配，返回匹配行号和位置。前端新增搜索栏和底部面板组件，集成到现有 `JsonTreeView` 虚拟滚动视图中。

**Tech Stack:** Rust (regex crate) + React 19 + Ant Design 6 + TypeScript

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/pages/json/JsonSearchBar.tsx` | 搜索栏 UI（输入框 + 模式开关 + 导航按钮） |
| Create | `src/pages/json/JsonSearchResults.tsx` | 底部结果面板（可滚动匹配列表） |
| Modify | `src-tauri/src/json_editor.rs` | 新增 `SearchResult` 结构体 + `json_search` 命令 |
| Modify | `src-tauri/src/lib.rs` | 注册 `json_search` 命令 |
| Modify | `src-tauri/Cargo.toml` | 添加 `regex` 依赖 |
| Modify | `src/types/index.ts` | 新增 `SearchResult` 类型 |
| Modify | `src/pages/json/JsonTreeView.tsx` | 集成搜索栏 + 高亮 + 快捷键 + 底部面板 |

---

### Task 1: Rust 后端 — 添加 regex 依赖和 SearchResult 类型

**Files:**
- Modify: `src-tauri/Cargo.toml` (添加 regex 依赖)
- Modify: `src-tauri/src/json_editor.rs` (新增 SearchResult 结构体)

- [ ] **Step 1: 添加 regex crate 依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 段末尾添加：

```toml
regex = "1"
```

- [ ] **Step 2: 在 json_editor.rs 中添加 SearchResult 结构体**

在 `ValidationResult` 结构体之后（约第 158 行），添加：

```rust
/// Single search match result.
#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    /// Line number in fully-expanded view (1-based).
    pub expanded_line: u32,
    /// Line number in current collapsed view (1-based), 0 if hidden by collapse.
    pub visible_line: u32,
    /// Full content of the matched line.
    pub content: String,
    /// Byte offset of match start within content.
    pub match_start: u32,
    /// Byte offset of match end within content.
    pub match_end: u32,
}
```

- [ ] **Step 3: 在 json_editor.rs 顶部添加 regex 导入**

在 `use serde::Serialize;` 之后添加：

```rust
use regex::Regex;
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/json_editor.rs
git commit -m "feat(json-search): add regex dependency and SearchResult type"
```

---

### Task 2: Rust 后端 — 实现 json_search 命令

**Files:**
- Modify: `src-tauri/src/json_editor.rs` (新增 `build_line_mapping` + `json_search` 命令)

- [ ] **Step 1: 添加行号映射辅助函数**

在 `parse_error_position` 函数之后（约第 1004 行），添加：

```rust
/// Build a mapping from expanded-line-number → visible-line-number
/// for the current collapse state. Returns a Vec where index = expanded line (0-based),
/// value = visible line (1-based), or 0 if the line is inside a collapsed region.
fn build_line_mapping(
    nodes: &[FlatNode],
    collapsed: &HashSet<u32>,
    total_expanded: u32,
) -> Vec<u32> {
    // Walk the tree in expanded order, tracking which lines are visible
    // under the current collapse state.
    let mut mapping = vec![0u32; total_expanded as usize];
    let mut expanded_cursor: u32 = 0;
    let mut visible_cursor: u32 = 0;

    let mut stack: Vec<(u32, u8)> = vec![(0u32, 0u8)];

    while let Some((idx, phase)) = stack.pop() {
        if expanded_cursor >= total_expanded { break; }

        let node = &nodes[idx as usize];
        let is_container = node.value_type == VT_OBJECT || node.value_type == VT_ARRAY;

        if phase == 1 {
            // Close brace — always visible if we got here (parent not collapsed)
            if (expanded_cursor as usize) < mapping.len() {
                mapping[expanded_cursor as usize] = visible_cursor + 1;
            }
            expanded_cursor += 1;
            visible_cursor += 1;
            continue;
        }

        let is_collapsed = collapsed.contains(&idx);

        if is_container {
            if is_collapsed {
                // Collapsed container: 1 visible line, but `expanded_line_count` expanded lines
                mapping[expanded_cursor as usize] = visible_cursor + 1;
                expanded_cursor += 1;
                visible_cursor += 1;

                // Skip remaining expanded lines (children + close brace)
                if node.expanded_line_count > 1 {
                    expanded_cursor += node.expanded_line_count - 1;
                }
            } else {
                // Open brace — visible
                mapping[expanded_cursor as usize] = visible_cursor + 1;
                expanded_cursor += 1;
                visible_cursor += 1;

                stack.push((idx, 1));
                if node.child_count > 0 {
                    for i in (0..node.child_count).rev() {
                        stack.push((node.first_child + i, 0));
                    }
                }
            }
        } else {
            // Leaf node
            mapping[expanded_cursor as usize] = visible_cursor + 1;
            expanded_cursor += 1;
            visible_cursor += 1;
        }
    }

    mapping
}
```

- [ ] **Step 2: 添加文本匹配辅助函数**

在 `build_line_mapping` 之后添加：

```rust
/// Find all match ranges in a string using the given search mode.
fn find_matches(
    content: &str,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
) -> Vec<(u32, u32)> {
    let pattern = if whole_word && !use_regex {
        format!(r"\b{}\b", regex::escape(query))
    } else if use_regex {
        query.to_string()
    } else {
        regex::escape(query)
    };

    let re = RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .size_limit(10 * (1 << 20)) // 10 MB limit for safety
        .build();

    match re {
        Ok(re) => re
            .find_iter(content)
            .map(|m| (m.start() as u32, m.end() as u32))
            .collect(),
        Err(_) => Vec::new(), // Invalid regex, return no matches
    }
}
```

- [ ] **Step 3: 添加 json_search 命令**

在 `find_matches` 之后，Tauri 命令区域之前添加：

```rust
#[tauri::command]
pub fn json_search(
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
    state: State<'_, Mutex<JsonEditorState>>,
) -> Result<Vec<SearchResult>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let s = state.lock().map_err(|e| format!("状态锁错误: {}", e))?;
    let value = s.value.as_ref().ok_or("未加载 JSON 文件")?;

    // Search in fully expanded view (empty collapse set)
    let empty_collapsed = HashSet::new();
    let expanded_total = compute_visible_total(&s.nodes, 0, &empty_collapsed);

    // Build an ad-hoc skip index for the expanded view
    let expanded_skip = SkipIndex::build(&s.nodes, 0, &empty_collapsed);

    // Fetch ALL lines in expanded view (chunked to avoid huge allocations)
    let chunk_size: u32 = 1000;
    let mut all_lines: Vec<VisibleLine> = Vec::with_capacity(expanded_total as usize);
    let mut offset: u32 = 0;
    while offset < expanded_total {
        let (_, chunk) = get_visible_lines(
            &s.nodes,
            &s.key_table,
            &empty_collapsed,
            &expanded_skip,
            expanded_total,
            value,
            s.expand_json_strings,
            offset,
            chunk_size,
        );
        let fetched = chunk.len() as u32;
        all_lines.extend(chunk);
        if fetched == 0 { break; }
        offset += fetched;
    }

    // Build line mapping (expanded → visible) for current collapse state
    let line_mapping = build_line_mapping(&s.nodes, &s.collapsed_nodes, expanded_total);

    // Search each line
    let mut results = Vec::new();
    for line in &all_lines {
        let expanded_idx = (line.line_number - 1) as usize;
        let matches = find_matches(&line.content, &query, case_sensitive, whole_word, use_regex);
        for (start, end) in matches {
            let visible = if expanded_idx < line_mapping.len() {
                line_mapping[expanded_idx]
            } else {
                0
            };
            results.push(SearchResult {
                expanded_line: line.line_number,
                visible_line: visible,
                content: line.content.clone(),
                match_start: start,
                match_end: end,
            });
        }
    }

    Ok(results)
}
```

- [ ] **Step 4: 在 lib.rs 中注册命令**

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 宏中添加 `json_editor::json_search`：

```rust
.invoke_handler(tauri::generate_handler![
    json_editor::json_open_file,
    json_editor::json_toggle_collapse,
    json_editor::json_update_node,
    json_editor::json_format,
    json_editor::json_minify,
    json_editor::json_validate,
    json_editor::json_save,
    json_editor::json_get_formatted_text,
    json_editor::json_toggle_expand_strings,
    json_editor::json_get_lines,
    json_editor::json_search,
])
```

- [ ] **Step 5: 验证编译通过**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished dev [unoptimized + debuginfo]` with no errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/json_editor.rs src-tauri/src/lib.rs
git commit -m "feat(json-search): implement json_search command with line mapping"
```

---

### Task 3: 前端类型定义

**Files:**
- Modify: `src/types/index.ts` (新增 `SearchResult` 接口)

- [ ] **Step 1: 添加 SearchResult 类型**

在 `src/types/index.ts` 文件末尾（`JsonValidationResult` 之后）添加：

```typescript
// ===== JSON Search =====

export interface SearchResult {
  expanded_line: number;
  visible_line: number;
  content: string;
  match_start: number;
  match_end: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(json-search): add SearchResult type"
```

---

### Task 4: 前端 — JsonSearchBar 组件

**Files:**
- Create: `src/pages/json/JsonSearchBar.tsx`

- [ ] **Step 1: 创建搜索栏组件**

创建 `src/pages/json/JsonSearchBar.tsx`：

```tsx
import React, { useRef, useEffect } from "react";
import { Input, Button, Space, Tooltip } from "antd";
import {
  CloseOutlined,
  UpOutlined,
  DownOutlined,
  SearchOutlined,
} from "@ant-design/icons";

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

interface JsonSearchBarProps {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchCount: number;
  currentIndex: number;
  onQueryChange: (query: string) => void;
  onToggleCase: () => void;
  onToggleWholeWord: () => void;
  onToggleRegex: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

const JsonSearchBar: React.FC<JsonSearchBarProps> = ({
  query,
  caseSensitive,
  wholeWord,
  useRegex,
  matchCount,
  currentIndex,
  onQueryChange,
  onToggleCase,
  onToggleWholeWord,
  onToggleRegex,
  onNext,
  onPrev,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus and select when opened
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const matchText =
    matchCount === 0
      ? "无结果"
      : `${currentIndex + 1}/${matchCount}`;

  const matchColor = matchCount === 0 ? "#ff4d4f" : "#666";

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: active ? "1px solid #1677ff" : "1px solid #d9d9d9",
    borderRadius: 4,
    background: active ? "#e6f4ff" : "#fff",
    color: active ? "#1677ff" : "#666",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    userSelect: "none",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 16,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 8px",
        background: "#fff",
        borderRadius: "0 0 6px 6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        border: "1px solid #e8e8e8",
        borderTop: "none",
      }}
    >
      <Input
        ref={inputRef as any}
        size="small"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="搜索..."
        style={{ width: 200, fontSize: 13 }}
        prefix={<SearchOutlined style={{ color: "#999" }} />}
      />
      <Space size={2}>
        <Tooltip title="区分大小写">
          <div style={btnStyle(caseSensitive)} onClick={onToggleCase}>
            Aa
          </div>
        </Tooltip>
        <Tooltip title="全词匹配">
          <div style={btnStyle(wholeWord)} onClick={onToggleWholeWord}>
            Ab
          </div>
        </Tooltip>
        <Tooltip title="正则表达式">
          <div style={btnStyle(useRegex)} onClick={onToggleRegex}>
            .*
          </div>
        </Tooltip>
      </Space>
      <span style={{ fontSize: 12, color: matchColor, minWidth: 44, textAlign: "center" }}>
        {matchText}
      </span>
      <Space size={2}>
        <Button
          size="small"
          icon={<UpOutlined />}
          onClick={onPrev}
          disabled={matchCount === 0}
          style={{ width: 28, height: 28 }}
        />
        <Button
          size="small"
          icon={<DownOutlined />}
          onClick={onNext}
          disabled={matchCount === 0}
          style={{ width: 28, height: 28 }}
        />
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{ width: 28, height: 28 }}
        />
      </Space>
    </div>
  );
};

export default JsonSearchBar;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/json/JsonSearchBar.tsx
git commit -m "feat(json-search): add JsonSearchBar component"
```

---

### Task 5: 前端 — JsonSearchResults 底部面板组件

**Files:**
- Create: `src/pages/json/JsonSearchResults.tsx`

- [ ] **Step 1: 创建底部结果面板组件**

创建 `src/pages/json/JsonSearchResults.tsx`：

```tsx
import React, { useRef, useCallback } from "react";
import { CloseOutlined } from "@ant-design/icons";
import type { SearchResult } from "../../types";

interface JsonSearchResultsProps {
  results: SearchResult[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  panelHeight: number;
  onHeightChange: (height: number) => void;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 400;

const JsonSearchResults: React.FC<JsonSearchResultsProps> = ({
  results,
  currentIndex,
  onSelect,
  onClose,
  panelHeight,
  onHeightChange,
}) => {
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = panelHeight;

      const handleMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = startYRef.current - ev.clientY;
        const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta));
        onHeightChange(newHeight);
      };

      const handleUp = () => {
        draggingRef.current = false;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [panelHeight, onHeightChange]
  );

  if (results.length === 0) return null;

  const renderContent = (result: SearchResult) => {
    const { content, match_start, match_end } = result;
    const before = content.slice(0, match_start);
    const match = content.slice(match_start, match_end);
    const after = content.slice(match_end);

    const truncatedBefore =
      before.length > 30 ? "..." + before.slice(-30) : before;
    const truncatedAfter =
      after.length > 50 ? after.slice(0, 50) + "..." : after;

    return (
      <span>
        <span style={{ color: "#999" }}>{truncatedBefore}</span>
        <span style={{ background: "#ffe58f", color: "#333" }}>{match}</span>
        <span style={{ color: "#666" }}>{truncatedAfter}</span>
      </span>
    );
  };

  return (
    <div
      style={{
        height: panelHeight,
        background: "rgba(255,255,255,0.97)",
        borderTop: "1px solid #e8e8e8",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 4,
          cursor: "ns-resize",
          background: "#e8e8e8",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.background = "#bbb";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.background = "#e8e8e8";
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 12px",
          borderBottom: "1px solid #f0f0f0",
          fontSize: 12,
          color: "#666",
          flexShrink: 0,
        }}
      >
        <span>
          搜索结果: {results.length} 项匹配
        </span>
        <CloseOutlined
          style={{ cursor: "pointer", fontSize: 12 }}
          onClick={onClose}
        />
      </div>

      {/* Results list */}
      <div style={{ flex: 1, overflow: "auto", fontSize: 12 }}>
        {results.map((result, idx) => {
          const isCurrent = idx === currentIndex;
          const isHidden = result.visible_line === 0;
          return (
            <div
              key={idx}
              onClick={() => onSelect(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "3px 12px",
                cursor: "pointer",
                background: isCurrent ? "#e6f4ff" : "transparent",
                opacity: isHidden ? 0.5 : 1,
                borderBottom: "1px solid #f5f5f5",
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLElement).style.background = "#fafafa";
                }
              }}
              onMouseLeave={(e) => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              <span
                style={{
                  minWidth: 40,
                  color: "#999",
                  fontSize: 11,
                  fontFamily: "'Cascadia Code', Consolas, monospace",
                  textAlign: "right",
                  marginRight: 8,
                  flexShrink: 0,
                }}
              >
                {isHidden ? "…" : result.visible_line}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "'Cascadia Code', Consolas, monospace",
                }}
              >
                {renderContent(result)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JsonSearchResults;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/json/JsonSearchResults.tsx
git commit -m "feat(json-search): add JsonSearchResults bottom panel component"
```

---

### Task 6: 前端 — 集成搜索到 JsonTreeView

**Files:**
- Modify: `src/pages/json/JsonTreeView.tsx` (搜索状态 + 快捷键 + 高亮 + 搜索栏/面板集成)

这是最大的任务。需要修改 `JsonTreeView.tsx` 中的多个部分。

- [ ] **Step 1: 添加导入和搜索状态**

在 `JsonTreeView.tsx` 文件顶部的导入区域，修改导入并添加新组件的引用：

将现有导入替换为：

```tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Input, message } from "antd";
import {
  CaretRightOutlined,
  CaretDownOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../store/segmentStore";
import type { VisibleLine, SearchResult } from "../../types";
import JsonSearchBar from "./JsonSearchBar";
import JsonSearchResults from "./JsonSearchResults";
```

在 `JsonTreeView` 组件内部，紧接在现有 state 声明之后（`const [viewHeight, setViewHeight] = useState(600);` 之后），添加搜索状态：

```tsx
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [resultsPanelHeight, setResultsPanelHeight] = useState(200);
  const [resultsPanelOpen, setResultsPanelOpen] = useState(false);
```

- [ ] **Step 2: 添加搜索逻辑函数**

在搜索状态声明之后添加搜索执行和跳转函数：

```tsx
  // Execute search
  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentMatchIndex(0);
      setResultsPanelOpen(false);
      return;
    }
    try {
      const results = await invoke<SearchResult[]>("json_search", {
        query,
        caseSensitive,
        wholeWord,
        useRegex,
      });
      setSearchResults(results);
      setCurrentMatchIndex(0);
      setResultsPanelOpen(results.length > 0);
      // Auto-jump to first visible result
      if (results.length > 0) {
        const first = results.find((r) => r.visible_line > 0) || results[0];
        jumpToResult(first, results);
      }
    } catch (e) {
      message.error(`搜索失败: ${e}`);
    }
  }, [caseSensitive, wholeWord, useRegex]);

  // Jump to a specific search result
  const jumpToResult = useCallback(async (result: SearchResult, allResults?: SearchResult[]) => {
    const results = allResults || searchResults;
    if (result.visible_line > 0 && containerRef.current) {
      // Visible — just scroll
      containerRef.current.scrollTop = (result.visible_line - 1) * LINE_HEIGHT;
    } else {
      // Hidden by collapse — expand the node containing this line
      // The node_path is embedded in the line content; we need to fetch the line
      // to get its node_path. For now, we use the expanded_line to find it.
      try {
        const lines = await invoke<VisibleLine[]>("json_get_lines", {
          start: result.expanded_line - 1,
          count: 1,
        });
        if (lines.length > 0 && lines[0].node_path) {
          // Walk up the path to find a collapsible ancestor
          const parts = lines[0].node_path.split(".");
          for (let i = parts.length - 1; i >= 1; i--) {
            const ancestorPath = parts.slice(0, i).join(".");
            try {
              await invoke<[number, VisibleLine[]]>("json_toggle_collapse", {
                nodePath: ancestorPath,
              });
            } catch {
              // Not collapsible, try next ancestor
            }
          }
          // Refresh lines
          const newStart = Math.max(0, Math.floor((containerRef.current?.scrollTop ?? 0) / LINE_HEIGHT) - BUFFER);
          const newLines = await invoke<VisibleLine[]>("json_get_lines", {
            start: newStart,
            count: FETCH_SIZE,
          });
          const total = useAppStore.getState().jsonTotalLines;
          setJsonLines(total, newLines, newStart);

          // Re-search to get updated visible_line values
          const newResults = await invoke<SearchResult[]>("json_search", {
            query: searchQuery,
            caseSensitive,
            wholeWord,
            useRegex,
          });
          setSearchResults(newResults);
          const idx = newResults.findIndex(
            (r) => r.expanded_line === result.expanded_line && r.visible_line > 0
          );
          if (idx >= 0 && containerRef.current) {
            containerRef.current.scrollTop = (newResults[idx].visible_line - 1) * LINE_HEIGHT;
          }
        }
      } catch {
        // Ignore errors during auto-expand
      }
    }
  }, [searchResults, searchQuery, caseSensitive, wholeWord, useRegex, setJsonLines]);

  // Navigate to next/prev match
  const goToNextMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(next);
    jumpToResult(searchResults[next], searchResults);
  }, [searchResults, currentMatchIndex, jumpToResult]);

  const goToPrevMatch = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prev);
    jumpToResult(searchResults[prev], searchResults);
  }, [searchResults, currentMatchIndex, jumpToResult]);

  // Close search
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchResults([]);
    setSearchQuery("");
    setCurrentMatchIndex(0);
    setResultsPanelOpen(false);
  }, []);
```

- [ ] **Step 3: 添加快捷键监听**

在搜索逻辑函数之后添加 `useEffect`：

```tsx
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + F → open search
      if (mod && e.key === "f") {
        e.preventDefault();
        if (!isJsonLoaded) return;
        setSearchOpen(true);
        return;
      }

      // Cmd/Ctrl + D → next match
      if (mod && e.key === "d" && searchOpen) {
        e.preventDefault();
        goToNextMatch();
        return;
      }

      // Escape → close search
      if (e.key === "Escape" && searchOpen) {
        e.preventDefault();
        closeSearch();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isJsonLoaded, searchOpen, goToNextMatch, closeSearch]);
```

注意：需要从 store 中解构 `isJsonLoaded`。在现有 store 解构中添加：

找到：
```tsx
  const {
    jsonTotalLines,
    jsonFetchedLines,
    jsonFetchStart,
    jsonValidationError,
    setJsonLines,
  } = useAppStore();
```

替换为：
```tsx
  const {
    jsonTotalLines,
    jsonFetchedLines,
    jsonFetchStart,
    jsonValidationError,
    isJsonLoaded,
    setJsonLines,
  } = useAppStore();
```

- [ ] **Step 4: 构建行号→搜索结果映射**

在 `visibleSlice` 计算之后添加：

```tsx
  // Build a map: line_number → search results for that line
  const searchHitsByLine = useMemo(() => {
    const map = new Map<number, { results: SearchResult[]; isCurrent: boolean }>();
    if (searchResults.length === 0) return map;
    for (let i = 0; i < searchResults.length; i++) {
      const r = searchResults[i];
      if (r.visible_line === 0) continue;
      const existing = map.get(r.visible_line);
      if (existing) {
        existing.results.push(r);
        if (i === currentMatchIndex) existing.isCurrent = true;
      } else {
        map.set(r.visible_line, { results: [r], isCurrent: i === currentMatchIndex });
      }
    }
    return map;
  }, [searchResults, currentMatchIndex]);
```

- [ ] **Step 5: 修改行渲染以支持搜索高亮**

需要修改渲染每行内容的部分，在每行的 `<div>` 中添加搜索高亮背景。

找到现有渲染循环中的每行 `<div>` （`visibleSlice.map` 内部），在行容器 `div` 的 `style` 中添加搜索高亮背景。

将现有的行容器 div：

```tsx
              <div
                key={line.line_number}
                style={{
                  display: "flex",
                  minHeight: LINE_HEIGHT,
                  background: isError ? "#fff2f0" : "transparent",
                  borderBottom: isError ? "1px solid #ffccc7" : "none",
                }}
              >
```

替换为：

```tsx
              <div
                key={line.line_number}
                style={{
                  display: "flex",
                  minHeight: LINE_HEIGHT,
                  background: isError
                    ? "#fff2f0"
                    : searchHitsByLine.has(line.line_number)
                    ? "#fffbe6"
                    : "transparent",
                  borderBottom: isError ? "1px solid #ffccc7" : "none",
                }}
              >
```

然后修改内容渲染部分。找到 `renderLineContent(line)` 的调用处（在 `<span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>` 内部）：

将：
```tsx
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {renderLineContent(line)}
                      </span>
```

替换为：

```tsx
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {renderLineContentWithSearch(line, searchHitsByLine.get(line.line_number))}
                      </span>
```

- [ ] **Step 6: 添加带搜索高亮的渲染函数**

在文件底部的 `renderLineContent` 函数之后添加新函数：

```tsx
function renderLineContentWithSearch(
  line: VisibleLine,
  searchHit?: { results: SearchResult[]; isCurrent: boolean }
): React.ReactNode {
  if (!searchHit || searchHit.results.length === 0) {
    return renderLineContent(line);
  }

  // Merge all match ranges, then render with highlights
  const content = line.content;
  const sorted = [...searchHit.results].sort((a, b) => a.match_start - b.match_start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const hit of sorted) {
    if (hit.match_start < cursor) continue; // Skip overlapping
    if (hit.match_start > cursor) {
      parts.push(renderContentSpan(content.slice(cursor, hit.match_start), content, cursor));
    }
    const isCurrentMatch = searchHit.isCurrent &&
      searchHit.results.indexOf(hit) === searchHit.results.length - 1 ||
      (searchHit.results.length === 1 && searchHit.isCurrent);

    parts.push(
      <span
        key={`h-${hit.match_start}`}
        style={{
          background: searchHit.isCurrent ? "#f5a623" : "#ffe58f",
          borderRadius: 2,
        }}
      >
        {renderContentSpan(content.slice(hit.match_start, hit.match_end), content, hit.match_start)}
      </span>
    );
    cursor = hit.match_end;
  }

  if (cursor < content.length) {
    parts.push(renderContentSpan(content.slice(cursor), content, cursor));
  }

  return <>{parts}</>;
}

/// Render a content span with syntax coloring applied.
function renderContentSpan(
  text: string,
  fullContent: string,
  _offset: number,
): React.ReactNode {
  // Apply syntax coloring for the text fragment
  if (text.startsWith('"')) return <span style={{ color: "#0b8a0b" }}>{text}</span>;
  if (text === "true" || text === "false") return <span style={{ color: "#0550ae" }}>{text}</span>;
  if (text === "null") return <span style={{ color: "#8b949e" }}>{text}</span>;
  if (/^[-]?\d/.test(text)) return <span style={{ color: "#098658" }}>{text}</span>;

  // Check if this is inside a key part (before ": ")
  const colonIdx = fullContent.indexOf(": ");
  if (colonIdx >= 0 && _offset < colonIdx) {
    return <span style={{ color: "#a31515" }}>{text}</span>;
  }

  return <span style={{ color: "#333" }}>{text}</span>;
}
```

- [ ] **Step 7: 在 JSX 中集成搜索栏和底部面板**

修改 `return` 中的 JSX。将树视图容器改为支持底部面板的布局。

找到：
```tsx
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onDoubleClick={handleDoubleClick}
      style={{
        flex: 1,
        overflow: "auto",
        fontFamily:
          "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
        fontSize: 13,
        lineHeight: `${LINE_HEIGHT}px`,
        background: "#fafafa",
        position: "relative",
      }}
    >
```

替换为（包装搜索栏和面板）：

```tsx
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {/* Search bar */}
      {searchOpen && (
        <JsonSearchBar
          query={searchQuery}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
          useRegex={useRegex}
          matchCount={searchResults.length}
          currentIndex={currentMatchIndex}
          onQueryChange={(q) => {
            setSearchQuery(q);
            doSearch(q);
          }}
          onToggleCase={() => {
            setCaseSensitive((v) => !v);
            // Re-search with new setting
            setTimeout(() => doSearch(searchQuery), 0);
          }}
          onToggleWholeWord={() => {
            setWholeWord((v) => !v);
            setTimeout(() => doSearch(searchQuery), 0);
          }}
          onToggleRegex={() => {
            setUseRegex((v) => !v);
            setTimeout(() => doSearch(searchQuery), 0);
          }}
          onNext={goToNextMatch}
          onPrev={goToPrevMatch}
          onClose={closeSearch}
        />
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        onDoubleClick={handleDoubleClick}
        style={{
          flex: 1,
          overflow: "auto",
          fontFamily:
            "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
          fontSize: 13,
          lineHeight: `${LINE_HEIGHT}px`,
          background: "#fafafa",
          position: "relative",
        }}
      >
```

然后找到文件末尾时间戳 tooltip 之后，闭合的 `</div>` 标签：

```tsx
      {/* Timestamp tooltip */}
      {tsTooltip && (
        ...
      )}
    </div>
  );
};
```

在最后的 `</div>` 之前添加底部面板和闭合标签：

```tsx
      </div>

      {/* Search results panel */}
      {resultsPanelOpen && searchResults.length > 0 && (
        <JsonSearchResults
          results={searchResults}
          currentIndex={currentMatchIndex}
          onSelect={(idx) => {
            setCurrentMatchIndex(idx);
            jumpToResult(searchResults[idx], searchResults);
          }}
          onClose={() => setResultsPanelOpen(false)}
          panelHeight={resultsPanelHeight}
          onHeightChange={setResultsPanelHeight}
        />
      )}
    </div>
```

- [ ] **Step 8: 验证编译通过**

Run: `cd /Users/cyd/projects/ai/videoSplit/video-splitter && pnpm build 2>&1 | tail -10`
Expected: No TypeScript errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/json/JsonTreeView.tsx
git commit -m "feat(json-search): integrate search into JsonTreeView with highlights and keyboard shortcuts"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Cmd+F/Ctrl+F 打开搜索栏 — Task 6 Step 3
- ✅ Cmd+D 跳转下一个 — Task 6 Step 3
- ✅ Escape 关闭 — Task 6 Step 3
- ✅ Enter 搜索 — JsonSearchBar 中 Input 的 onChange 触发 doSearch
- ✅ 大小写/全词/正则按钮 — Task 4 (JsonSearchBar) + Task 6 Step 7
- ✅ 底部结果面板 — Task 5 (JsonSearchResults) + Task 6 Step 7
- ✅ 被折叠结果灰显，点击展开 — Task 5 Step 1 + Task 6 Step 2 (jumpToResult)
- ✅ Rust 全文搜索 — Task 2
- ✅ 行号映射 — Task 2 Step 1
- ✅ 搜索高亮 — Task 6 Steps 4-6
- ✅ 正则/字符串搜索 — Task 2 Step 2

**2. Placeholder scan:** No TBD/TODO found. All code blocks are complete.

**3. Type consistency:** `SearchResult` type defined consistently in Rust (Task 1) and TypeScript (Task 3). Props interface matches between components.
