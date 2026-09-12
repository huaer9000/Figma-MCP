import assert from "node:assert/strict"
import { test } from "node:test"

import { WebSocket } from "ws"

import { PROTOCOL_VERSION } from "../shared/constants.ts"
import { BridgeError } from "../shared/errors.ts"
import {
  encodeMessage,
  makeBinMessages,
  makeEvent,
  makeOk,
  parseMessage,
} from "../shared/protocol.ts"
import { PluginBridge } from "../server/src/bridge.ts"

/**
 * 已握手的测试客户端。
 *
 * @param port 桥端口
 * @param options.autoPong 是否自动回 pong。默认 true。测漏 pong 时传 false。
 */
async function connectPlugin(
  port: number,
  options: { autoPong?: boolean } = {}
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
    autoPong: options.autoPong ?? true,
  })
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve())
    ws.once("error", reject)
  })
  ws.send(
    encodeMessage(
      makeEvent("hello", {
        protocol: PROTOCOL_VERSION,
        pluginVersion: "1.0.0",
        fileName: "Demo",
        currentPageName: "Page 1",
        currentPageId: "0:1",
      })
    )
  )
  await waitEvent(ws, "hello_ack")
  return ws
}

/**
 * 等待指定事件。
 */
function waitEvent(ws: WebSocket, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${name} 超时`)), 2000)
    ws.on("message", (raw) => {
      const msg = parseMessage(String(raw))
      if (msg.kind === "event" && msg.name === name) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

test("localhost 也能连上桥", async () => {
  const bridge = await PluginBridge.listen(0)
  const ws = new WebSocket(`ws://localhost:${bridge.listenPort}`)
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve())
    ws.once("error", reject)
  })
  ws.close()
  await bridge.close()
})

test("错误协议会被拒绝", async () => {
  const bridge = await PluginBridge.listen(0)
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.listenPort}`)
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve())
    ws.once("error", reject)
  })
  ws.send(encodeMessage(makeEvent("hello", { protocol: 99 })))
  await waitEvent(ws, "hello_nack")
  await bridge.close()
})

test("握手后能排队调用并保持顺序", async () => {
  const bridge = await PluginBridge.listen(0)
  const ws = await connectPlugin(bridge.listenPort)
  const seen: string[] = []
  ws.on("message", (raw) => {
    const msg = parseMessage(String(raw))
    if (msg.kind === "req") {
      seen.push(msg.method)
      ws.send(encodeMessage(makeOk(msg.id, { method: msg.method })))
    }
  })
  const first = bridge.request("get_selection", {}, 1000)
  const second = bridge.request("get_current_page", {}, 1000)
  const results = await Promise.all([first, second])
  assert.deepEqual(
    results.map((item) => (item.result as { method: string }).method),
    ["get_selection", "get_current_page"]
  )
  assert.deepEqual(seen, ["get_selection", "get_current_page"])
  ws.close()
  await bridge.close()
})

test("未连接立即失败", async () => {
  const bridge = await PluginBridge.listen(0)
  await assert.rejects(
    () => bridge.request("get_selection", {}, 1000),
    (err: unknown) => err instanceof BridgeError && err.code === "PLUGIN_NOT_CONNECTED"
  )
  await bridge.close()
})

test("超时后丢弃迟到响应", async () => {
  const bridge = await PluginBridge.listen(0)
  const ws = await connectPlugin(bridge.listenPort)
  const pending = bridge.request("get_selection", {}, 80)
  await assert.rejects(
    () => pending,
    (err: unknown) => err instanceof BridgeError && err.code === "TIMEOUT"
  )
  ws.close()
  await bridge.close()
})

test("分片二进制能重组", async () => {
  const bridge = await PluginBridge.listen(0)
  const ws = await connectPlugin(bridge.listenPort)
  const bytes = Uint8Array.from([9, 8, 7, 6])
  ws.on("message", (raw) => {
    const msg = parseMessage(String(raw))
    if (msg.kind === "req") {
      for (const frame of makeBinMessages(msg.id, "file", bytes)) {
        ws.send(encodeMessage(frame))
      }
      ws.send(encodeMessage(makeOk(msg.id, { width: 1 })))
    }
  })
  const { result, binaries } = await bridge.request("export_node", {}, 1000)
  assert.deepEqual(result, { width: 1 })
  assert.deepEqual(binaries.file, bytes)
  ws.close()
  await bridge.close()
})

test("端口占用时失败", async () => {
  const first = await PluginBridge.listen(0)
  await assert.rejects(
    () => PluginBridge.listen(first.listenPort, { bindAttempts: 1 }),
    /已被占用/
  )
  await first.close()
})

test("默认心跳漏 pong 不会掐断空闲连接", async () => {
  const bridge = await PluginBridge.listen(0, { heartbeatMs: 40, closeAfterMissedPongs: 0 })
  const ws = await connectPlugin(bridge.listenPort, { autoPong: false })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(bridge.status.connected, true)
  ws.close()
  await bridge.close()
})

test("显式按漏 pong 关闭时才会掐断", async () => {
  const bridge = await PluginBridge.listen(0, { heartbeatMs: 40, closeAfterMissedPongs: 1 })
  const ws = await connectPlugin(bridge.listenPort, { autoPong: false })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(bridge.status.connected, false)
  ws.close()
  await bridge.close()
})

test("关闭后同一端口能再次监听", async () => {
  const first = await PluginBridge.listen(0)
  const port = first.listenPort
  await first.close()
  const second = await PluginBridge.listen(port, { bindAttempts: 3, bindRetryMs: 50 })
  assert.equal(second.listenPort, port)
  await second.close()
})
