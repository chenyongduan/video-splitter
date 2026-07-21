# macOS 自动更新发布

ToolKit 使用 Tauri Updater。应用启动时 `UpdateButton` 会请求更新端点；如果发现更高版本，用户点击“更新”后，插件下载并校验更新包，替换应用并重启。

```text
启动 ToolKit
  -> 请求 latest-darwin-aarch64.json 或 latest-darwin-x86_64.json
  -> 比较 SemVer 版本
  -> 下载 ToolKit_<version>_<arch>.app.tar.gz
  -> 用内置公钥验证 .sig 的 minisign 签名
  -> 替换 .app 并重启
```

DMG 只用于首次安装；自动更新使用 Tauri 生成的 `.app.tar.gz`，不能把 DMG 的 URL 放进更新清单。Apple 代码签名/公证与 Tauri 更新签名是两层独立校验：前者让 macOS 信任应用，后者保证更新包来自持有 Tauri 私钥的发布者。

## 一次性准备

1. 将 `toolKit.key` 安全保存在本机或 CI 密钥库；它是 Tauri 更新私钥，不能提交到 Git，也不能更换，否则已安装版本无法验证新更新。
2. 在 Apple Developer 账号中创建并安装 `Developer ID Application` 证书。
3. 配置 Apple 公证：使用 App Store Connect API 凭据，或 Apple ID、专用密码与 Team ID。
4. 确保 CDN 可上传 `https://static-app.97kid.com/app/tool-kit/` 下的静态文件，并保留 HTTPS。

可用以下命令确认本机可用的代码签名身份：

```bash
security find-identity -v -p codesigning
```

## 发布 Apple Silicon 更新

更新四处版本号：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`。版本必须严格递增。

```bash
export APPLE_SIGNING_IDENTITY='Developer ID Application: <名称>'
export APPLE_ID='<Apple ID 邮箱>'
export APPLE_PASSWORD='<App 专用密码>'
export APPLE_TEAM_ID='<Team ID>'
export UPDATE_NOTES='修复 macOS 自动更新'
pnpm release:macos:update
```

也可用 `APPLE_API_ISSUER`、`APPLE_API_KEY`、`APPLE_API_KEY_PATH` 替代三项 Apple ID 凭据。脚本默认读取项目根目录（已被 Git 忽略）的 `toolKit.key`；如密钥放在其他位置，设置 `TAURI_SIGNING_PRIVATE_KEY_PATH` 为文件路径，或由 CI 直接设置 `TAURI_SIGNING_PRIVATE_KEY` 为密钥内容。

脚本会构建并校验以下文件，放到 `.release/macos-updater/`：

- `ToolKit_<version>_aarch64.app.tar.gz`
- `ToolKit_<version>_aarch64.app.tar.gz.sig`
- `latest-darwin-aarch64.json`

将三个文件上传到 `https://static-app.97kid.com/app/tool-kit/`。先上传归档和签名，最后上传 JSON，避免客户端拿到不完整发布。

## Intel macOS

在 Intel Mac 上运行同一命令会生成 `x86_64` 版本和 `latest-darwin-x86_64.json`。两个架构必须各自产生、签名和发布；不要让一个架构的 JSON 指向另一个架构的归档。

## 发布后校验

```bash
curl --fail --silent https://static-app.97kid.com/app/tool-kit/latest-darwin-aarch64.json
codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/ToolKit.app
spctl --assess --type execute --verbose=4 src-tauri/target/release/bundle/macos/ToolKit.app
```

在一台安装旧版本的 macOS 设备上启动 ToolKit，确认出现“更新”入口，完成下载安装并自动重启到新版本。正式发布时也应保留 DMG，供首次安装用户下载。
