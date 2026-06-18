# 日志查看 — 文件加载（拖入 / 选择）设计文档

日期：2026-06-18
状态：已批准，待实现
关联：`2026-06-18-log-viewer-design.md`（日志查看工具主体）

## 1. 目标

给已实现的「日志查看」tab 增加两种加载日志的方式：**拖入文件** 和 **选择文件**，作为「粘贴文本」之外的补充入口。加载后直接进入查看态。

## 2. 非目标

- 不做流式/分块读取（沿用主体工具的整文件内存模型，与粘贴等价）。
- 不写 Rust 自定义命令。
- 不做文件类型/后缀过滤。
- 不改 capabilities / 不加依赖。

## 3. 行为

- **拖入文件**：窗口级监听 `getCurrentWindow().onDragDropEvent`（与 `src/pages/json/index.tsx` 一致），`drop` 时取 `paths[0]`，读内容 → 进入查看态。
- **选择文件**：「选择文件」按钮调用 `open({ multiple: false })`（`@tauri-apps/plugin-dialog`，无 filters），选完读内容 → 进入查看态。
- 两种方式在**输入态和查看态都可用**：拖入为窗口级、全局生效；「选择文件」按钮同时放在输入态和 `LogToolbar`（查看态）里。
- 统一入口 `loadText(content: string)`：`setText(content)` + `search.reset()`。`text.length > 0` 自动切换到查看态，复用现有渲染/搜索链路。

## 4. 读取方式

- `@tauri-apps/plugin-fs` 的 `readTextFile(path)`，纯前端。
- 权限 `dialog:allow-open`、`fs:allow-read-file`（path `**`）已在 `src-tauri/capabilities/default.json` 授予 → 无需改 capabilities、无需重建 Rust，前端 HMR 即生效。

## 5. 错误处理

- 读取失败（不存在 / 无权限 / 非 UTF-8 不可解码等）：`message.error("打开文件失败: …")`，停留当前态，不崩。
- 空文件（`content.length === 0`）：`message.warning("文件为空")`，停留输入态（因为 `text.length > 0` 才进查看态）。
- 拖入多文件：只取第一个。

## 6. 改动文件

- `src/pages/log/index.tsx`
  - 新增 `loadText(content)`。
  - 新增 `openLogFile(path)`：`readTextFile(path)` → 成功 `loadText`，失败 `message.error`。
  - 新增 `handleOpenFile()`：`open({ multiple:false })` → 非 null 则 `openLogFile`。
  - 新增窗口级 `onDragDropEvent` effect：`drop` → `openLogFile(paths[0])`。
  - 输入态区域加「选择文件」按钮。
  - 向 `LogToolbar` 传 `onOpenFile={handleOpenFile}`。
- `src/pages/log/LogToolbar.tsx`
  - 新增 prop `onOpenFile: () => void`。
  - 加「选择文件」按钮（`FolderOpenOutlined`，`Tooltip title="选择文件"`，样式对齐 json 页 `JsonToolbar`）。

## 7. 验证

- `npx tsc --noEmit` 零错误。
- 手动：拖入 `.log`/`.txt` → 直接进查看态、行号与搜索正常；「选择文件」同样；读不存在/无权限文件 → 报错不崩；空文件 → 「文件为空」提示。

## 8. 实现方式

改动小（2 文件、约 30 行、完全照搬 json 页已有模式）→ 写完本 spec 后**直接实现**，不走完整 subagent 多任务流程。
