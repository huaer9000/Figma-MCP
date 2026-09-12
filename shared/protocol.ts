/**
 * 插件与本机服务共用的桥协议。
 */

import { CHUNK_SIZE, MAX_PAYLOAD_BYTES, PROTOCOL_VERSION } from "./constants.js"
import { BridgeError, type ErrorCode } from "./errors.js"

/** 请求帧。 */
export interface ReqMessage {
  v: 1
  id: string
  kind: "req"
  method: string
  params: unknown
}

/** 成功响应。 */
export interface OkResMessage {
  v: 1
  id: string
  kind: "res"
  ok: true
  result: unknown
}

/** 失败响应。 */
export interface ErrResMessage {
  v: 1
  id: string
  kind: "res"
  ok: false
  error: { code: ErrorCode; message: string; details?: unknown }
}

export type ResMessage = OkResMessage | ErrResMessage

/** 事件帧。 */
export interface EventMessage {
  v: 1
  kind: "event"
  name: string
  payload: unknown
}

/** 二进制分片帧。 */
export interface BinMessage {
  v: 1
  id: string
  kind: "bin"
  key: string
  index: number
  total: number
  data: string
}

export type BridgeMessage = ReqMessage | ResMessage | EventMessage | BinMessage

/** hello 事件载荷。 */
export interface HelloPayload {
  protocol: number
  pluginVersion: string
  fileName: string
  currentPageName: string
  currentPageId: string
}

/**
 * 解析一条 JSON 文本帧。非法或版本不匹配时抛错。
 *
 * @param raw WebSocket 文本
 */
export function parseMessage(raw: string): BridgeMessage {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new BridgeError("INVALID_ARGS", "桥消息不是合法 JSON")
  }
  if (!value || typeof value !== "object") {
    throw new BridgeError("INVALID_ARGS", "桥消息必须是对象")
  }
  const msg = value as { v?: unknown; kind?: unknown }
  if (msg.v !== PROTOCOL_VERSION) {
    throw new BridgeError("PROTOCOL_MISMATCH", `不支持的协议版本：${String(msg.v)}`)
  }
  if (msg.kind !== "req" && msg.kind !== "res" && msg.kind !== "event" && msg.kind !== "bin") {
    throw new BridgeError("INVALID_ARGS", `未知消息类型：${String(msg.kind)}`)
  }
  return value as BridgeMessage
}

/**
 * 编码一条消息为 JSON 文本。
 *
 * @param message 协议对象
 */
export function encodeMessage(message: BridgeMessage): string {
  return JSON.stringify(message)
}

/**
 * 构造请求。
 */
export function makeReq(id: string, method: string, params: unknown): ReqMessage {
  return { v: 1, id, kind: "req", method, params }
}

/**
 * 构造成功响应。
 */
export function makeOk(id: string, result: unknown): OkResMessage {
  return { v: 1, id, kind: "res", ok: true, result }
}

/**
 * 构造失败响应。
 */
export function makeErr(id: string, code: ErrorCode, message: string, details?: unknown): ErrResMessage {
  return details === undefined
    ? { v: 1, id, kind: "res", ok: false, error: { code, message } }
    : { v: 1, id, kind: "res", ok: false, error: { code, message, details } }
}

/**
 * 构造事件。
 */
export function makeEvent(name: string, payload: unknown): EventMessage {
  return { v: 1, kind: "event", name, payload }
}

/**
 * 把字节按 256KiB 切片。
 *
 * @param bytes 原始字节
 */
export function chunkBytes(bytes: Uint8Array, chunkSize = CHUNK_SIZE): Uint8Array[] {
  if (bytes.byteLength === 0) {
    return [new Uint8Array(0)]
  }
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)))
  }
  return chunks
}

/**
 * 把分片重新拼成一份 Buffer。超限则抛 PAYLOAD_TOO_LARGE。
 *
 * @param chunks 按 index 排序后的分片
 */
export function assembleChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, part) => sum + part.byteLength, 0)
  if (total > MAX_PAYLOAD_BYTES) {
    throw new BridgeError(
      "PAYLOAD_TOO_LARGE",
      `导出体积 ${total} 字节超过 ${MAX_PAYLOAD_BYTES} 上限，请降低 scale 或改导出 SVG`
    )
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of chunks) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

/**
 * Uint8Array 转 base64。主线程与 Node 都能用。
 *
 * @param bytes 原始字节
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const nodeBuffer = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }).Buffer
  if (nodeBuffer) {
    return nodeBuffer.from(bytes).toString("base64")
  }
  let binary = ""
  const batch = 0x8000
  for (let i = 0; i < bytes.length; i += batch) {
    const slice = bytes.subarray(i, i + batch)
    binary += String.fromCharCode(...slice)
  }
  return globalThis.btoa(binary)
}

/**
 * base64 转 Uint8Array。
 *
 * @param data base64 文本
 */
export function base64ToBytes(data: string): Uint8Array {
  const nodeBuffer = (globalThis as { Buffer?: { from(data: string, enc: string): Uint8Array } }).Buffer
  if (nodeBuffer) {
    return Uint8Array.from(nodeBuffer.from(data, "base64"))
  }
  const binary = globalThis.atob(data)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

/**
 * 生成分片协议帧。
 *
 * @param id 请求 id
 * @param key 逻辑文件键
 * @param bytes 完整字节
 */
export function makeBinMessages(id: string, key: string, bytes: Uint8Array): BinMessage[] {
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
    throw new BridgeError(
      "PAYLOAD_TOO_LARGE",
      `导出体积 ${bytes.byteLength} 字节超过 ${MAX_PAYLOAD_BYTES} 上限，请降低 scale 或改导出 SVG`
    )
  }
  const parts = chunkBytes(bytes)
  return parts.map((part, index) => ({
    v: 1 as const,
    id,
    kind: "bin" as const,
    key,
    index,
    total: parts.length,
    data: bytesToBase64(part),
  }))
}
