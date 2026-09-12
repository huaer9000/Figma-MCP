/**
 * 标准 MCP 工具注册。不绑定某一家客户端。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { LAYOUT_POSITIONING, LAYOUT_SIZING } from "../../shared/auto-layout.js"
import { DEFAULT_TIMEOUT_MS, EXPORT_TIMEOUT_MS, PROTOCOL_VERSION } from "../../shared/constants.js"
import { BridgeError, toBridgeError } from "../../shared/errors.js"
import {
  MCP_INSTRUCTIONS,
  WRITE_GUIDELINES,
  WRITE_GUIDELINES_URI,
} from "../../shared/write-guidelines.js"
import type { PluginBridge } from "./bridge.js"
import { bytesToBase64 } from "../../shared/protocol.js"
import { readImageFile, writeBinaryFile, writeImplementBundle } from "./files.js"

const fillSchema = z
  .object({
    r: z.number(),
    g: z.number(),
    b: z.number(),
    a: z.number().optional(),
  })
  .strict()

const fontNameSchema = z
  .object({
    family: z.string().min(1),
    style: z.string().min(1),
  })
  .strict()

/**
 * 创建 MCP 服务：握手带写入原则，并挂上 23 个工具和一份资源。
 *
 * @param bridge 插件桥
 */
export function createMcpServer(bridge: PluginBridge): McpServer {
  const server = new McpServer({ name: "figma-bridge", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS })

  server.registerResource(
    "write-guidelines",
    WRITE_GUIDELINES_URI,
    {
      title: "写入画布原则",
      description: "跨稿通用的 Figma 写入原则。复刻或改稿前先读。不含某一页的量测。",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: WRITE_GUIDELINES,
        },
      ],
    })
  )

  server.tool("figma_status", "查询插件是否已连接，以及当前文件与页面。未连接也成功返回。", async () =>
    ok({ ...bridge.status, protocol: bridge.status.protocol ?? PROTOCOL_VERSION })
  )

  server.tool("figma_get_document_info", "获取当前文件名、页面列表和当前页 id。", async () =>
    call(bridge, "get_document_info", {}, DEFAULT_TIMEOUT_MS)
  )

  server.tool("figma_get_current_page", "获取当前页摘要、顶层子节点和选区。", async () =>
    call(bridge, "get_current_page", {}, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_current_page",
    "切换到指定页面。会先 loadAsync。",
    { pageId: z.string().min(1) },
    async ({ pageId }) => call(bridge, "set_current_page", { pageId }, DEFAULT_TIMEOUT_MS)
  )

  server.tool("figma_get_selection", "获取当前选区摘要。空选区返回空数组，不是错误。", async () =>
    call(bridge, "get_selection", {}, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_get_node",
    "读取单个节点。detail=summary|layout|rest_json，默认 layout。",
    {
      nodeId: z.string().min(1),
      detail: z.enum(["summary", "layout", "rest_json"]).optional(),
      maxDepth: z.number().int().min(0).max(10).optional(),
    },
    async (args) => call(bridge, "get_node", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_get_node_tree",
    "读取 layout 级节点树，供浏览结构。",
    {
      nodeId: z.string().min(1),
      maxDepth: z.number().int().min(0).max(10).optional(),
    },
    async (args) => call(bridge, "get_node_tree", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_read_for_implement",
    "像素级还原打包：结构、预览图、位图资源落到 outputDir。省略 nodeId 时要求恰好选中 1 个节点。",
    {
      nodeId: z.string().min(1).optional(),
      outputDir: z.string().min(1),
    },
    async (args) => {
      try {
        const { result, binaries } = await bridge.request("read_for_implement", { nodeId: args.nodeId }, EXPORT_TIMEOUT_MS)
        const payload = asRecord(result)
        const written = await writeImplementBundle({
          outputDir: args.outputDir,
          binaries,
          meta: asRecord(payload.meta),
          node: payload.node,
        })
        return ok({
          outputDir: written.outputDir,
          files: written.files,
          meta: payload.meta,
        })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    "figma_export_node",
    "导出节点到本地文件。必须提供绝对路径 outputPath。不要把图片以 base64 传回。",
    {
      nodeId: z.string().min(1),
      format: z.enum(["PNG", "JPG", "SVG", "PDF"]).optional(),
      scale: z.number().positive().optional(),
      outputPath: z.string().min(1),
    },
    async (args) => {
      try {
        const { result, binaries } = await bridge.request(
          "export_node",
          { nodeId: args.nodeId, format: args.format ?? "PNG", scale: args.scale ?? 2 },
          EXPORT_TIMEOUT_MS
        )
        const file = binaries.file
        if (!file) {
          throw new BridgeError("EXPORT_FAILED", "插件没有返回导出字节")
        }
        const outputPath = await writeBinaryFile(args.outputPath, file)
        const payload = asRecord(result)
        return ok({
          path: outputPath,
          bytes: file.byteLength,
          width: payload.width,
          height: payload.height,
          format: payload.format,
          scale: payload.scale,
        })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    "figma_create_frame",
    "在当前页或指定父节点创建 Frame。复刻时优先嵌套 Auto Layout；按钮用 Frame 包文案并居中。",
    {
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      name: z.string().optional(),
      parentId: z.string().min(1).optional(),
    },
    async (args) => call(bridge, "create_frame", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_create_rectangle",
    "创建矩形。",
    {
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      name: z.string().optional(),
      parentId: z.string().min(1).optional(),
      fill: fillSchema.optional(),
      cornerRadius: z.number().optional(),
    },
    async (args) => call(bridge, "create_rectangle", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_create_ellipse",
    "创建椭圆。",
    {
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      name: z.string().optional(),
      parentId: z.string().min(1).optional(),
      fill: fillSchema.optional(),
    },
    async (args) => call(bridge, "create_ellipse", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_create_text",
    "创建文本。指定字体失败不会改用其它字体。",
    {
      characters: z.string(),
      x: z.number(),
      y: z.number(),
      parentId: z.string().min(1).optional(),
      fontSize: z.number().positive().optional(),
      fontName: fontNameSchema.optional(),
      fill: fillSchema.optional(),
    },
    async (args) => call(bridge, "create_text", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_create_image",
    "从本机图片文件创建矩形或 SVG 节点。不支持远程 URL。色块不能当成已经插图。",
    {
      imagePath: z.string().min(1),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      name: z.string().optional(),
      parentId: z.string().min(1).optional(),
      cornerRadius: z.number().optional(),
      scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional(),
    },
    async (args) => {
      const file = await readImageFile(args.imagePath)
      const { imagePath: _imagePath, ...rest } = args
      const payload =
        file.ext === ".svg"
          ? { ...rest, svgText: new TextDecoder().decode(file.bytes) }
          : { ...rest, imageBase64: bytesToBase64(file.bytes) }
      return call(bridge, "create_image", payload, EXPORT_TIMEOUT_MS)
    }
  )

  server.tool(
    "figma_update_node",
    "更新节点名称、位置、尺寸、可见性、透明度、旋转，以及 Auto Layout 子项的 FILL/HUG/绝对定位。",
    {
      nodeId: z.string().min(1),
      name: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      visible: z.boolean().optional(),
      opacity: z.number().optional(),
      rotation: z.number().optional(),
      horizontalSizing: z.enum(LAYOUT_SIZING).optional(),
      verticalSizing: z.enum(LAYOUT_SIZING).optional(),
      layoutPositioning: z.enum(LAYOUT_POSITIONING).optional(),
    },
    async (args) => call(bridge, "update_node", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_fill",
    "设置单层纯色填充，或用 clear 去掉填充（透明 Frame，不要用 a:0 冒充去底）。",
    {
      nodeId: z.string().min(1),
      fill: fillSchema.optional(),
      clear: z.boolean().optional(),
    },
    async (args) => call(bridge, "set_fill", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_stroke",
    "设置单层实线描边。",
    {
      nodeId: z.string().min(1),
      color: fillSchema,
      weight: z.number().nonnegative(),
    },
    async (args) => call(bridge, "set_stroke", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_effects",
    "设置效果。第一版可写 BACKGROUND_BLUR / LAYER_BLUR / DROP_SHADOW / INNER_SHADOW。毛玻璃用半透明填充加 BACKGROUND_BLUR。",
    {
      nodeId: z.string().min(1),
      effects: z
        .array(
          z
            .object({
              type: z.enum(["BACKGROUND_BLUR", "LAYER_BLUR", "DROP_SHADOW", "INNER_SHADOW"]),
              radius: z.number().nonnegative(),
              visible: z.boolean().optional(),
              spread: z.number().optional(),
              offset: z.object({ x: z.number(), y: z.number() }).strict().optional(),
              color: fillSchema.optional(),
            })
            .strict()
        )
        .optional(),
      clear: z.boolean().optional(),
    },
    async (args) => call(bridge, "set_effects", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_corner_radius",
    "设置圆角。四角独立优先。",
    {
      nodeId: z.string().min(1),
      radius: z.number().optional(),
      topLeft: z.number().optional(),
      topRight: z.number().optional(),
      bottomRight: z.number().optional(),
      bottomLeft: z.number().optional(),
    },
    async (args) => call(bridge, "set_corner_radius", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_text_style",
    "设置文本节点级样式。",
    {
      nodeId: z.string().min(1),
      fontSize: z.number().positive().optional(),
      fontName: fontNameSchema.optional(),
      lineHeight: z
        .object({
          unit: z.enum(["AUTO", "PIXELS", "PERCENT"]),
          value: z.number().nullable().optional(),
        })
        .strict()
        .optional(),
      letterSpacing: z
        .object({
          unit: z.enum(["PIXELS", "PERCENT"]),
          value: z.number(),
        })
        .strict()
        .optional(),
      textAlignHorizontal: z.string().optional(),
      characters: z.string().optional(),
    },
    async (args) => call(bridge, "set_text_style", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_set_auto_layout",
    "设置 Auto Layout。打开后要把横排全宽设 FIXED 或子项 FILL，否则会 HUG 变窄。",
    {
      nodeId: z.string().min(1),
      layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]),
      padding: z
        .union([
          z.number(),
          z
            .object({
              top: z.number(),
              right: z.number(),
              bottom: z.number(),
              left: z.number(),
            })
            .strict(),
        ])
        .optional(),
      itemSpacing: z.number().optional(),
      primaryAxisAlign: z.string().optional(),
      counterAxisAlign: z.string().optional(),
      horizontalSizing: z.enum(LAYOUT_SIZING).optional(),
      verticalSizing: z.enum(LAYOUT_SIZING).optional(),
    },
    async (args) => call(bridge, "set_auto_layout", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_move_node",
    "移动节点，可选换父级。",
    {
      nodeId: z.string().min(1),
      x: z.number(),
      y: z.number(),
      parentId: z.string().min(1).optional(),
      index: z.number().int().nonnegative().optional(),
    },
    async (args) => call(bridge, "move_node", args, DEFAULT_TIMEOUT_MS)
  )

  server.tool(
    "figma_delete_node",
    "删除节点。不能删除 PAGE 或 DOCUMENT。",
    { nodeId: z.string().min(1) },
    async ({ nodeId }) => call(bridge, "delete_node", { nodeId }, DEFAULT_TIMEOUT_MS)
  )

  return server
}

/**
 * 转发到插件并把结果收成 MCP 文本。
 */
async function call(bridge: PluginBridge, method: string, params: unknown, timeoutMs: number) {
  try {
    const { result } = await bridge.request(method, params, timeoutMs)
    return ok(result)
  } catch (err) {
    return fail(err)
  }
}

/**
 * 成功结果。只回 JSON 文本，不带回图片字节。
 */
function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: true, data }) }],
  }
}

/**
 * 失败结果。isError 必须为 true。
 */
function fail(err: unknown) {
  const error = toBridgeError(err)
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: error.toJSON() }) }],
  }
}

/**
 * 把未知值收成对象。
 */
function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
