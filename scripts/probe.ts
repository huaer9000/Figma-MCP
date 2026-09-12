/**
 * 等插件连上后跑一遍只读 + 切图探测。
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { DEFAULT_PORT, EXPORT_TIMEOUT_MS } from "../shared/constants.ts"
import { PluginBridge } from "../server/src/bridge.ts"

const waitMs = Number(process.env.FIGMA_PROBE_WAIT_MS || 45000)
const port = Number(process.env.FIGMA_BRIDGE_PORT || DEFAULT_PORT)

const bridge = await PluginBridge.listen(port)
console.log(`[probe] 监听 127.0.0.1:${bridge.listenPort}，等待插件最多 ${waitMs}ms`)

const started = Date.now()
while (!bridge.status.connected && Date.now() - started < waitMs) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  const elapsed = Math.round((Date.now() - started) / 1000)
  if (elapsed > 0 && elapsed % 5 === 0) {
    console.log(`[probe] 仍未连接（${elapsed}s） status=${JSON.stringify(bridge.status)}`)
  }
}

if (!bridge.status.connected) {
  console.error("[probe] 插件未连接。请在 Figma Desktop 运行「Figma设计桥接」并保持面板打开。")
  await bridge.close()
  process.exit(2)
}

console.log("[probe] 已连接", JSON.stringify(bridge.status))

const doc = await bridge.request("get_document_info", {}, 15000)
console.log("[probe] document", JSON.stringify(doc.result))

const page = await bridge.request("get_current_page", {}, 15000)
console.log("[probe] page", JSON.stringify(page.result).slice(0, 2000))

const selection = await bridge.request("get_selection", {}, 15000)
console.log("[probe] selection", JSON.stringify(selection.result))

const pageData = page.result as {
  children?: Array<{ id: string; name: string; type: string; width?: number; height?: number }>
}
const sel = selection.result as { nodes?: Array<{ id: string; type: string }> }
const target =
  sel.nodes?.find((node) => node.type === "FRAME" || node.type === "COMPONENT" || node.type === "GROUP") ??
  pageData.children?.find((node) => node.type === "FRAME") ??
  sel.nodes?.[0] ??
  pageData.children?.[0]

if (!target) {
  console.log("[probe] 当前页没有可导出节点，跳过切图")
  await bridge.close()
  process.exit(0)
}

const out = path.join(os.tmpdir(), `figma-bridge-probe-${Date.now()}.png`)
const exported = await bridge.request("export_node", { nodeId: target.id, format: "PNG", scale: 1 }, EXPORT_TIMEOUT_MS)
const bytes = exported.binaries.file
if (!bytes || bytes.byteLength === 0) {
  console.error("[probe] 切图失败，没有字节")
  await bridge.close()
  process.exit(3)
}
fs.writeFileSync(out, Buffer.from(bytes))
console.log("[probe] export", JSON.stringify(exported.result), "path", out, "bytes", bytes.byteLength)

await bridge.close()
console.log("[probe] 完成")
