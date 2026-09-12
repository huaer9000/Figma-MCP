/**
 * 插件 UI：连接本机桥，转发命令，显示状态。
 */

import { DEFAULT_PORT, PROTOCOL_VERSION } from "../../shared/constants.js"
import {
  bytesToBase64,
  encodeMessage,
  makeEvent,
  parseMessage,
  type HelloPayload,
} from "../../shared/protocol.js"
import { coerceBinBytes } from "./bin-transfer.js"

const statusEl = document.getElementById("status") as HTMLElement
const fileEl = document.getElementById("file") as HTMLElement
const pageEl = document.getElementById("page") as HTMLElement
const portEl = document.getElementById("port") as HTMLElement
const errorEl = document.getElementById("error") as HTMLElement
const reconnectBtn = document.getElementById("reconnect") as HTMLButtonElement

const port = Number(new URLSearchParams(location.search).get("port") || DEFAULT_PORT)
portEl.textContent = String(port)

let socket: WebSocket | null = null
let hello: HelloPayload | null = null
let reconnectTimer: number | null = null

reconnectBtn.addEventListener("click", () => {
  connect()
})

window.onmessage = (event: MessageEvent) => {
  const message = event.data?.pluginMessage
  if (!message || typeof message !== "object") {
    return
  }
  if (message.type === "hello-payload") {
    hello = message.payload as HelloPayload
    fileEl.textContent = hello.fileName
    pageEl.textContent = hello.currentPageName
    sendHello()
    return
  }
  if (message.type === "bin") {
    try {
      sendRaw(
        encodeMessage({
          v: 1,
          id: message.id,
          kind: "bin",
          key: message.key,
          index: message.index,
          total: message.total,
          data: bytesToBase64(coerceBinBytes(message.bytes)),
        })
      )
    } catch (err) {
      setDisconnected(err instanceof Error ? err.message : String(err))
    }
    return
  }
  if (message.type === "res") {
    if (message.ok) {
      sendRaw(encodeMessage({ v: 1, id: message.id, kind: "res", ok: true, result: message.result }))
    } else {
      sendRaw(encodeMessage({ v: 1, id: message.id, kind: "res", ok: false, error: message.error }))
    }
  }
}

connect()

/**
 * 连接本机桥。
 */
function connect(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  setDisconnected("正在连接…")
  const ws = new WebSocket(`ws://localhost:${port}`)
  socket = ws
  ws.onopen = () => {
    parent.postMessage({ pluginMessage: { type: "hello-request" } }, "*")
  }
  ws.onmessage = (event) => {
    try {
      const message = parseMessage(String(event.data))
      if (message.kind === "event" && message.name === "hello_ack") {
        setConnected()
        return
      }
      if (message.kind === "event" && message.name === "hello_nack") {
        const payload = message.payload as { message?: string }
        setDisconnected(payload.message || "协议不匹配")
        return
      }
      if (message.kind === "req") {
        parent.postMessage(
          { pluginMessage: { type: "req", id: message.id, method: message.method, params: message.params } },
          "*"
        )
      }
    } catch (err) {
      setDisconnected(err instanceof Error ? err.message : String(err))
    }
  }
  ws.onclose = () => {
    if (socket === ws) {
      setDisconnected("未连接。请先启动 Figma设计桥接 MCP。")
      reconnectTimer = window.setTimeout(() => connect(), 3000)
    }
  }
  ws.onerror = () => {
    ws.close()
  }
}

/**
 * 发送 hello。必须已有文件信息且套接字已开。
 */
function sendHello(): void {
  if (!hello || !socket || socket.readyState !== WebSocket.OPEN) {
    return
  }
  sendRaw(encodeMessage(makeEvent("hello", { ...hello, protocol: PROTOCOL_VERSION })))
}

/**
 * 发送原始帧。
 */
function sendRaw(text: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return
  }
  socket.send(text)
}

/**
 * 已连接展示。
 */
function setConnected(): void {
  statusEl.textContent = "已连接"
  statusEl.dataset.state = "ok"
  errorEl.textContent = ""
}

/**
 * 未连接展示。
 */
function setDisconnected(reason: string): void {
  statusEl.textContent = "未连接"
  statusEl.dataset.state = "off"
  errorEl.textContent = reason
}
