# 日志查看工具 — 设计文档

日期：2026-06-18
状态：已批准，待实现

## 1. 目标与范围

在 MediaKit 顶部新增一个独立 Tab「日志查看」，让用户把任意日志文本**直接粘贴**进来，然后以高性能方式浏览并搜索。

- 纯前端，不经过 Rust、不调用 sidecar、不引入新依赖。
- 面向**大型日志**（几万到几十万行），必须虚拟滚动。
- 行号、固定换行（`pre-wrap`）、镜像现有 JSON 工具页的搜索体验。

非目标：日志级别着色/过滤、换行开关、文件拖拽加载、跨页面状态共享。

## 2. 入口与类型改动

- `src/types/index.ts`：`AppTab` 联合类型增加 `"log"`。
- `src/App.tsx`：
  - Tabs 增加一项 `{ key: "log", label: "日志查看" }`。
  - Content 增加分支 `{activeTab === "log" && <LogPage />}`。
  - localStorage 白名单 `["video","audio","image","icon","json","log"]` 加 `"log"`。
  - 顶部 import `LogPage from "./pages/log"`。

## 3. 交互流程

1. **输入态**（`text` 为空）：一个占满区域的大 `<textarea>`，placeholder「粘贴日志文本…」，下方「查看日志」按钮；支持 Ctrl/Cmd+Enter 直接加载。
2. **查看态**（`text` 非空）：顶部 `LogToolbar` + 可选的 `LogSearchBar`（绝对定位右上角，风格同 JSON 页），下方 `LogViewer`。
3. 工具栏「清空」把 `text` 置空，回到输入态。

文本只存在 `index.tsx` 的本地组件 state（`useState`），不入 Zustand —— 理由：临时粘贴内容、无跨页共享需求。

## 4. 组件拆分（`src/pages/log/`）

| 文件 | 职责 |
|---|---|
| `index.tsx` | 页面入口；持有 `text`、输入/查看态切换、组合子组件 |
| `LogToolbar.tsx` | 工具栏：行数显示、「清空」、「搜索」按钮（打开搜索条） |
| `LogSearchBar.tsx` | 搜索条（照搬 JSON 页样式） |
| `LogViewer.tsx` | 可变行高虚拟滚动容器 |
| `LogLine.tsx` | 单逻辑行：行号 + 折行文本 + 命中高亮 |
| `useLogSearch.ts` | 搜索 hook：构造 matcher、扫描行、维护命中行索引与当前指针 |
| `highlight.ts` | 工具：按 matcher 把一行文本切成普通段 + 命中段，供 `LogLine` 渲染 |

单元边界：`LogViewer` 只管滚动窗口；`LogLine` 只管一行渲染；`useLogSearch` 只管匹配逻辑。三者可独立理解和改动（日后换虚拟化方案时不碰搜索）。

## 5. 可变行高虚拟化（核心）

利用日志等宽字体：每行像素宽度 = `字符数 × 单字宽度`，无需逐行量像素。

**度量（加载时 + 容器宽度变化时）：**
- 用 canvas 2D context 量一次单字宽度 `charWidth`（等宽，量任一字符即可）。
- `contentWidth` = 容器内容宽 − 行号列宽。
- 每逻辑行折行数：`rows[i] = max(1, ceil(lineChars[i] * charWidth / contentWidth))`。
- 行高：`h[i] = rows[i] * LINE_HEIGHT`（`LINE_HEIGHT` 取等宽 13px 字体约 20px）。

**坐标：**
- `prefixSum[0..n]`：`prefixSum[i]` = 第 i 行顶部 y 坐标（`prefixSum[0]=0`，`prefixSum[i+1]=prefixSum[i]+h[i]`）。
- `totalHeight = prefixSum[n]`。

**滚动渲染（`onScroll`）：**
- `startLine`：二分 `prefixSum` 找第一个「底部 > scrollTop」的行（即 `prefixSum[i+1] > scrollTop` 的最小 i），再 `− overscan`（overscan≈3）。
- 从 `startLine` 向后渲染，直到某行 `top > scrollTop + viewportHeight`，再加 overscan 截断。
- 只渲染窗口内的 `LogLine`，绝对定位 `top: prefixSum[i]`、`height: h[i]`。

**容器尺寸：** `ResizeObserver` 监听容器，宽度变化时重算 `rows[]`/`prefixSum`/`totalHeight`。

## 6. 搜索交互（镜像 JSON 页）

- 触发：**回车搜索**（非逐键），扫一次 `lines` 数组。
- 三模式：纯文本子串 / 全词（`\b` 边界包裹）/ 正则；大小写开关。`useLogSearch` 内按 flags 构造一个 matcher 函数（`(line: string) => boolean` 或返回命中区间）。
- 正则非法：`try/catch`，antd `message.error("正则表达式无效")`，不崩、清空命中。
- 空查询：清空命中，`matchCount = 0`。
- **`matchCount` = 含命中的行数**；`currentIndex` 指向「命中行索引列表」中的位置。
- 上/下按钮（及搜索条内）在命中行之间跳转；跳转 = 滚动定位到该行 + 该行加高亮边框。
- 行内高亮：`LogLine` 用 `highlight.ts` 把命中子串包成黄底 `<mark style={{background:"#ffe58f"}}>`。

`LogSearchBar` 视觉与 props 完全对齐现有 `src/pages/json/JsonSearchBar.tsx`：输入框 + Aa/Ab/.* 三开关 + `${currentIndex+1}/${matchCount}` 计数（无结果时红字「无结果」）+ 上/下/关闭按钮，回车 `onPressEnter → onSearch`。

## 7. 行号与换行

- 行号从 1 起，单独一列右对齐，与内容分列。
- 每个逻辑行只显示一次行号（位于该行块左上），折行的续行无行号。
- 固定 `white-space: pre-wrap`；不做换行开关。

## 8. 错误处理与验证

- 项目当前无测试/lint 配置 → 手动验证：
  - 小日志（几十行）粘贴、搜索三模式、上下跳转、清空回归。
  - 大日志（数万行）确认滚动流畅、首屏不卡。
  - 拉伸窗口宽度确认折行重算正确。
  - 非法正则确认有提示且不崩。

## 9. 改动文件清单

改：
- `src/types/index.ts`（`AppTab` 加 `"log"`）
- `src/App.tsx`（tab + 路由 + 白名单 + import）

新（`src/pages/log/`）：
- `index.tsx`、`LogToolbar.tsx`、`LogSearchBar.tsx`、`LogViewer.tsx`、`LogLine.tsx`、`useLogSearch.ts`、`highlight.ts`

## 10. 未来可能的扩展（不在本次范围）

- 换行开关 / 行宽自适应。
- 日志级别自动着色与级别过滤。
- 文件拖拽加载（可复用 JSON 页的 `onDragDropEvent` 模式）。
- 用 web worker 做超大日志的搜索，避免主线程偶发卡顿。
