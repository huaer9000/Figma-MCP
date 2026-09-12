/// <reference types="@figma/plugin-typings" />

/**
 * 由构建脚本注入的 UI HTML。
 */
declare const __html__: string

/**
 * 插件主线程：执行 figma.*，不发起网络。
 */

import { PLUGIN_VERSION, PROTOCOL_VERSION } from "../../shared/constants.js"
import { BridgeError, toBridgeError } from "../../shared/errors.js"
import { sendBinaryChunks } from "./bin-transfer.js"
import { runCommand } from "./commands.js"

figma.showUI(__html__, { width: 280, height: 220, title: "Figma设计桥接" })

void boot()

figma.on("currentpagechange", () => {
  void sendHello()
})

figma.ui.onmessage = (message: { type?: string; id?: string; method?: string; params?: unknown }) => {
  if (message.type === "hello-request") {
    void sendHello()
    return
  }
  if (message.type === "req" && message.id && message.method) {
    void handleRequest(message.id, message.method, message.params)
  }
}

/**
 * 启动时加载当前页并告知 UI 文件信息。
 */
async function boot(): Promise<void> {
  await figma.currentPage.loadAsync()
  await sendHello()
}

/**
 * 把 hello 载荷发给 UI。
 */
async function sendHello(): Promise<void> {
  await figma.currentPage.loadAsync()
  figma.ui.postMessage({
    type: "hello-payload",
    payload: {
      protocol: PROTOCOL_VERSION,
      pluginVersion: PLUGIN_VERSION,
      fileName: figma.root.name,
      currentPageName: figma.currentPage.name,
      currentPageId: figma.currentPage.id,
    },
  })
}

/**
 * 执行一条桥请求。
 */
async function handleRequest(id: string, method: string, params: unknown): Promise<void> {
  try {
    const output = await runCommand(method, params)
    const binaries = output.binaries ?? {}
    for (const [key, bytes] of Object.entries(binaries)) {
      await sendBinaryChunks(id, key, bytes, (message) => {
        figma.ui.postMessage(message)
      })
    }
    figma.ui.postMessage({ type: "res", id, ok: true, result: output.result })
  } catch (err) {
    const error = err instanceof BridgeError ? err : toBridgeError(err)
    figma.ui.postMessage({ type: "res", id, ok: false, error: error.toJSON() })
  }
}
