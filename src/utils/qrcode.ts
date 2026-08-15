import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

// QR 码字节模式的最大容量（版本 40、容错等级 L，约 2953 字节）
export const QR_MAX_BYTES = 2953;

/** 文本按 UTF-8 编码后的字节长度，用于判断是否超出二维码容量 */
export const textByteLength = (text: string): number =>
  new TextEncoder().encode(text).length;

/** 从二维码容器中取出 canvas 元素 */
export const getQrCanvas = (container: HTMLElement | null): HTMLCanvasElement | null =>
  container?.querySelector("canvas") ?? null;

/** 弹出保存对话框，把 canvas 内容导出为 PNG 文件 */
export const downloadQrPng = async (
  canvas: HTMLCanvasElement,
): Promise<void> => {
  const filePath = await save({
    defaultPath: "qrcode.png",
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
  if (!filePath) return;

  const base64 = canvas.toDataURL("image/png").split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await writeFile(filePath, bytes);
  await revealItemInDir(filePath);
};

/** 把 canvas 内容作为 RGBA 图片写入系统剪贴板 */
export const copyQrImage = async (canvas: HTMLCanvasElement): Promise<void> => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法读取二维码图像");
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  await invoke("plugin:clipboard-manager|write_image", {
    image: { rgba: new Uint8Array(data), width, height },
  });
};
