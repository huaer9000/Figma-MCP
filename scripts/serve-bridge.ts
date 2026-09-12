/**
 * 只拉起 WebSocket 桥并保持运行，方便插件先连上。
 * 与 Cursor MCP 不要同时开，会抢 17653。
 */

import { DEFAULT_PORT } from "../shared/constants.ts"
import { PluginBridge } from "../server/src/bridge.ts"

const port = Number(process.env.FIGMA_BRIDGE_PORT || DEFAULT_PORT)
const bridge = await PluginBridge.listen(port)
console.error(`[figma-bridge] 监听 127.0.0.1:${bridge.listenPort}，等待插件`)

let lastConnected = false
setInterval(() => {
  const status = bridge.status
  if (status.connected === lastConnected) {
    return
  }
  lastConnected = status.connected
  if (status.connected) {
    console.error(`[figma-bridge] 已连接 ${status.fileName ?? "-"} / ${status.pageName ?? "-"}`)
    return
  }
  console.error("[figma-bridge] 未连接")
}, 500)

process.on("SIGINT", () => {
  void bridge.close().then(() => process.exit(0))
})
process.on("SIGTERM", () => {
  void bridge.close().then(() => process.exit(0))
})
