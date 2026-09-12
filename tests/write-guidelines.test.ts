import assert from "node:assert/strict"
import { test } from "node:test"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { createMcpServer } from "../server/src/mcp.ts"
import type { PluginBridge } from "../server/src/bridge.ts"
import {
  GUIDELINE_REQUIRED_PHRASES,
  MCP_INSTRUCTIONS,
  WRITE_GUIDELINES,
  WRITE_GUIDELINES_URI,
} from "../shared/write-guidelines.ts"

const PAGE_SPECIFIC_LEAKS = ["Aetherfield", "1307:", "need-spiny", "务工平台"]

/**
 * 断言原则文本覆盖必要条款，且不含某一页的量测。
 *
 * @param text 待检查文本
 * @param label 断言失败时的名称
 */
function assertGuidelines(text: string, label: string) {
  for (const phrase of GUIDELINE_REQUIRED_PHRASES) {
    assert.match(text, new RegExp(phrase), `${label} 缺少「${phrase}」`)
  }
  for (const leak of PAGE_SPECIFIC_LEAKS) {
    assert.equal(text.includes(leak), false, `${label} 不应包含「${leak}」`)
  }
}

test("握手说明和资源正文覆盖同一套跨稿原则", () => {
  assertGuidelines(MCP_INSTRUCTIONS, "instructions")
  assertGuidelines(WRITE_GUIDELINES, "resource")
  assert.match(MCP_INSTRUCTIONS, /figma:\/\/write-guidelines/)
})

test("MCP 握手下发 instructions，并能读到写入原则资源", async () => {
  const mcp = createMcpServer({} as PluginBridge)
  const client = new Client({ name: "guidelines-test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])

  try {
    const instructions = client.getInstructions() ?? ""
    assert.equal(instructions, MCP_INSTRUCTIONS)

    const listed = await client.listResources()
    assert.equal(
      listed.resources.some((item) => item.uri === WRITE_GUIDELINES_URI),
      true
    )

    const read = await client.readResource({ uri: WRITE_GUIDELINES_URI })
    const text = read.contents
      .map((item) => ("text" in item ? item.text : ""))
      .join("\n")
    assert.equal(text, WRITE_GUIDELINES)
  } finally {
    await client.close()
    await mcp.close()
  }
})
