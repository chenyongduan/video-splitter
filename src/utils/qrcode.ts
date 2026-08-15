import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

// QR 码字节模式的最大容量（版本 40、容错等级 L，约 2953 字节）
export const QR_MAX_BYTES = 2953;

/** 文本按 UTF-8 编码后的字节长度，用于判断是否超出二维码容量 */
export const textByteLength = (text: string): number =>
  new TextEncoder().encode(text).length;

/**
 * 从二维码容器中取出 canvas 元素。
 * antd QRCode 会按设备像素比放大画布（如 Retina 下 300 显示为 600 像素），
 * 传入 size 时会重绘到精确的目标像素尺寸，保证导出图片与所选尺寸一致。
 */
export const getQrCanvas = (
  container: HTMLElement | null,
  size?: number,
): HTMLCanvasElement | null => {
  const canvas = container?.querySelector("canvas") ?? null;
  if (!canvas || size === undefined || canvas.width === size) return canvas;

  const normalized = document.createElement("canvas");
  normalized.width = size;
  normalized.height = size;
  const context = normalized.getContext("2d");
  if (!context) return canvas;
  // 二维码是纯色块，禁用平滑避免缩小时边缘发虚
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, 0, 0, size, size);
  return normalized;
};

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
