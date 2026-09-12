/**
 * 把插件回传的二进制写到本地磁盘。
 */

import fs from "node:fs/promises"
import path from "node:path"

import { MAX_PAYLOAD_BYTES } from "../../shared/constants.js"
import { BridgeError } from "../../shared/errors.js"
import { assertReadableFile, assertWritablePath } from "../../shared/path-guard.js"

/** 允许写入画布的本地图片扩展名。 */
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"])

/**
 * 读取本地图片，供写入画布。
 *
 * @param imagePath 绝对路径
 */
export async function readImageFile(imagePath: string): Promise<{
  resolved: string
  bytes: Uint8Array
  ext: string
}> {
  const resolved = assertReadableFile(imagePath)
  const ext = path.extname(resolved).toLowerCase()
  if (!IMAGE_EXTS.has(ext)) {
    throw new BridgeError("INVALID_ARGS", `不支持的图片格式：${ext}，请使用 PNG / JPG / WEBP / GIF / SVG`)
  }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await fs.readFile(resolved))
  } catch (err) {
    throw new BridgeError("IO_FAILED", `读取失败：${resolved}（${String(err)}）`)
  }
  if (bytes.byteLength === 0) {
    throw new BridgeError("INVALID_ARGS", `图片文件是空的：${resolved}`)
  }
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
    throw new BridgeError(
      "PAYLOAD_TOO_LARGE",
      `图片 ${bytes.byteLength} 字节超过 ${MAX_PAYLOAD_BYTES} 上限：${resolved}`
    )
  }
  return { resolved, bytes, ext }
}

/**
 * 写出单个导出文件。
 *
 * @param outputPath 绝对路径
 * @param bytes 文件字节
 */
export async function writeBinaryFile(outputPath: string, bytes: Uint8Array): Promise<string> {
  const resolved = assertWritablePath(outputPath, "file")
  try {
    await fs.writeFile(resolved, Buffer.from(bytes))
  } catch (err) {
    throw new BridgeError("IO_FAILED", `写入失败：${resolved}（${String(err)}）`)
  }
  return resolved
}

/**
 * 写出 JSON 文本。
 *
 * @param outputPath 绝对路径
 * @param value 对象
 */
export async function writeJsonFile(outputPath: string, value: unknown): Promise<string> {
  const resolved = assertWritablePath(outputPath, "file")
  try {
    await fs.writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  } catch (err) {
    throw new BridgeError("IO_FAILED", `写入失败：${resolved}（${String(err)}）`)
  }
  return resolved
}

/**
 * 像素级读取的落盘结果。
 *
 * @param outputDir 目录
 * @param binaries 插件分片重组后的文件
 * @param meta 元数据
 * @param node 可选：若插件把树放在 result 而不是二进制里
 */
export async function writeImplementBundle(input: {
  outputDir: string
  binaries: Record<string, Uint8Array>
  meta: Record<string, unknown>
  node?: unknown
  rest?: unknown
}): Promise<{ outputDir: string; files: Record<string, string | string[]> }> {
  const dir = assertWritablePath(input.outputDir, "dir")
  const files: Record<string, string | string[]> = {}

  if (input.binaries.node) {
    files.node = await writeBinaryFile(path.join(dir, "node.json"), input.binaries.node)
  } else if (input.node !== undefined) {
    files.node = await writeJsonFile(path.join(dir, "node.json"), input.node)
  }

  if (input.binaries.preview) {
    files.preview = await writeBinaryFile(path.join(dir, "preview.png"), input.binaries.preview)
  }

  if (input.binaries.rest) {
    files.rest = await writeBinaryFile(path.join(dir, "rest.json"), input.binaries.rest)
  } else if (input.rest !== undefined) {
    files.rest = await writeJsonFile(path.join(dir, "rest.json"), input.rest)
  }

  const assetDir = path.join(dir, "assets")
  const assetPaths: string[] = []
  for (const [key, bytes] of Object.entries(input.binaries)) {
    if (!key.startsWith("asset:")) {
      continue
    }
    const hash = key.slice("asset:".length)
    assetPaths.push(await writeBinaryFile(path.join(assetDir, `${hash}.png`), bytes))
  }
  if (assetPaths.length > 0) {
    files.assets = assetPaths
  }

  files.meta = await writeJsonFile(path.join(dir, "meta.json"), input.meta)
  return { outputDir: dir, files }
}
