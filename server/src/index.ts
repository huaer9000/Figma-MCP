/**
 * MCP stdio 入口。同时拉起本机 WebSocket 桥。
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { DEFAULT_PORT } from "../../shared/constants.js"
import { PluginBridge } from "./bridge.js"
import { createMcpServer } from "./mcp.js"

/**
 * 启动桥与 MCP。日志只能打到 stderr。
 */
async function main(): Promise<void> {
  const port = Number(process.env.FIGMA_BRIDGE_PORT || DEFAULT_PORT)
  if (!Number.isFinite(port) || port < 0) {
    console.error("FIGMA_BRIDGE_PORT 不是合法端口")
    process.exit(1)
  }

  let bridge: PluginBridge
  try {
    bridge = await PluginBridge.listen(port)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
    return
  }

  console.error(`[figma-bridge] 监听 127.0.0.1:${bridge.listenPort}`)
  installShutdown(bridge)
  const server = createMcpServer(bridge)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

/**
 * Cursor 停掉 MCP 时会关 stdin。必须立刻放掉端口，否则重启会撞上自己。
 *
 * @param bridge 已监听的桥
 */
function installShutdown(bridge: PluginBridge): void {
  let shuttingDown = false
  const shutdown = (reason: string) => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    console.error(`[figma-bridge] 退出（${reason}）`)
    void bridge.close().finally(() => process.exit(0))
  }
  process.stdin.on("end", () => shutdown("stdin 关闭"))
  process.stdin.on("close", () => shutdown("stdin 关闭"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
