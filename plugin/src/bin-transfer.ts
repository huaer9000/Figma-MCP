/**
 * 插件主线程到 UI 的大图发送。避免把 TypedArray 打成 number[]。
 */

import { CHUNK_SIZE } from "../../shared/constants.js"
import { chunkBytes } from "../../shared/protocol.js"

/** 主线程发给 UI 的分片。 */
export interface PluginBinFrame {
  type: "bin"
  id: string
  key: string
  index: number
  total: number
  bytes: Uint8Array
}

/**
 * 把分片拷成独立 ArrayBuffer，避免 structured clone 带上整图 backing store。
 *
 * @param chunk `chunkBytes` 返回的 subarray 视图
 */
export function isolateChunk(chunk: Uint8Array): Uint8Array {
  const copy = new Uint8Array(chunk.byteLength)
  copy.set(chunk)
  return copy
}

/**
 * 把 UI 收到的分片收成 Uint8Array。兼容 TypedArray 和旧的 number[]。
 *
 * @param bytes postMessage 传来的 bytes
 */
export function coerceBinBytes(bytes: unknown): Uint8Array {
  if (bytes instanceof Uint8Array) {
    return bytes
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes)
  }
  if (ArrayBuffer.isView(bytes)) {
    const view = bytes
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes as number[])
  }
  throw new Error("分片 bytes 必须是 Uint8Array 或 number[]")
}

/**
 * 让出事件循环，避免连续 postMessage 触发 Figma 插件看门狗。
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * 按片发送导出字节。每片都是独立 TypedArray，片与片之间让出主线程。
 *
 * @param id 请求 id
 * @param key 逻辑文件键
 * @param bytes 完整字节
 * @param postMessage 发给 UI
 * @param yieldFn 让出主线程；测试可注入
 * @param chunkSize 分片大小
 */
export async function sendBinaryChunks(
  id: string,
  key: string,
  bytes: Uint8Array,
  postMessage: (message: PluginBinFrame) => void,
  yieldFn: () => Promise<void> = yieldToEventLoop,
  chunkSize = CHUNK_SIZE
): Promise<void> {
  const chunks = chunkBytes(bytes, chunkSize)
  await yieldFn()
  for (let index = 0; index < chunks.length; index += 1) {
    postMessage({
      type: "bin",
      id,
      key,
      index,
      total: chunks.length,
      bytes: isolateChunk(chunks[index]),
    })
    await yieldFn()
  }
}
