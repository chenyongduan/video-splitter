import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(rootDirectory, "src-tauri", "tauri.conf.json");
const updaterOutputDirectory = path.join(rootDirectory, ".release", "macos-updater");
const updaterBaseUrl = (process.env.UPDATE_BASE_URL ?? "https://static-app.97kid.com/app/tool-kit").replace(/\/$/, "");
const signingKeyFromEnvironment = process.env.TAURI_SIGNING_PRIVATE_KEY;
const signingKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ?? path.join(rootDirectory, "toolKit.key");
const skipAppleNotarization = process.env.SKIP_APPLE_NOTARIZATION === "1";

const fail = (message) => {
  throw new Error(`macOS 更新发布失败：${message}`);
};

const exists = async (filePath) => {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const hasAppleIdCredentials = ["APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"].every((name) => process.env[name]);
const hasApiCredentials = ["APPLE_API_ISSUER", "APPLE_API_KEY", "APPLE_API_KEY_PATH"].every((name) => process.env[name]);

if (process.platform !== "darwin") {
  fail("仅能在 macOS 上运行");
}

if (!skipAppleNotarization && !process.env.APPLE_SIGNING_IDENTITY) {
  fail("缺少 APPLE_SIGNING_IDENTITY（Developer ID Application 证书名称）");
}

if (!skipAppleNotarization && !hasAppleIdCredentials && !hasApiCredentials) {
  fail("缺少 Apple 公证凭据；请设置 APPLE_ID、APPLE_PASSWORD、APPLE_TEAM_ID，或 APPLE_API_ISSUER、APPLE_API_KEY、APPLE_API_KEY_PATH");
}

if (!signingKeyFromEnvironment && !(await exists(signingKeyPath))) {
  fail("找不到 Tauri 更新签名私钥；请设置 TAURI_SIGNING_PRIVATE_KEY，或设置 TAURI_SIGNING_PRIVATE_KEY_PATH，或在项目根目录放置已忽略的 toolKit.key");
}

const signingKey = signingKeyFromEnvironment ?? (await readFile(signingKeyPath, "utf8"));

if (skipAppleNotarization) {
  console.warn("跳过 Apple 签名与公证：本次仅生成已签名的 Tauri 更新归档。");
}

const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
const productName = tauriConfig.productName;
const version = tauriConfig.version;
const arch = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : null;

if (!arch) {
  fail(`不支持的 macOS 架构：${process.arch}`);
}

const artifactDirectory = path.join(rootDirectory, "src-tauri", "target", "release", "bundle", "macos");
const sourceArchive = path.join(artifactDirectory, `${productName}.app.tar.gz`);
const sourceSignature = `${sourceArchive}.sig`;
const artifactName = `${productName}_${version}_${arch}.app.tar.gz`;
const manifestName = `latest-darwin-${arch}.json`;

console.log(`构建 ${productName} ${version}（darwin-${arch}）…`);
execFileSync("pnpm", ["tauri", "build", "--bundles", "app,dmg"], {
  cwd: rootDirectory,
  stdio: "inherit",
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: signingKey },
});

if (!(await exists(sourceArchive)) || !(await exists(sourceSignature))) {
  fail(`未生成更新产物：${sourceArchive} 和对应 .sig 文件必须存在`);
}

const archiveSize = (await stat(sourceArchive)).size;
if (archiveSize === 0) {
  fail("更新归档为空");
}

const signature = (await readFile(sourceSignature, "utf8")).trim();
if (!signature) {
  fail("更新签名为空");
}

await mkdir(updaterOutputDirectory, { recursive: true });
await cp(sourceArchive, path.join(updaterOutputDirectory, artifactName));
await cp(sourceSignature, path.join(updaterOutputDirectory, `${artifactName}.sig`));

const manifest = {
  version,
  notes: process.env.UPDATE_NOTES ?? "包含最新功能与问题修复",
  pub_date: new Date().toISOString(),
  url: `${updaterBaseUrl}/${artifactName}`,
  signature,
};

await writeFile(path.join(updaterOutputDirectory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);

console.log("macOS 更新产物已准备完成：");
console.log(`  ${path.relative(rootDirectory, path.join(updaterOutputDirectory, artifactName))}`);
console.log(`  ${path.relative(rootDirectory, path.join(updaterOutputDirectory, `${artifactName}.sig`))}`);
console.log(`  ${path.relative(rootDirectory, path.join(updaterOutputDirectory, manifestName))}`);
console.log(`请将以上三个文件上传到 ${updaterBaseUrl}/，再发布给用户。`);
