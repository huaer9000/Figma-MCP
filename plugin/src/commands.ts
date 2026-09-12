/// <reference types="@figma/plugin-typings" />

/**
 * 插件主线程命令。不发起网络请求。
 */

import {
  LARGE_TREE_THRESHOLD,
  MAX_PAYLOAD_BYTES,
  MAX_TREE_DEPTH,
} from "../../shared/constants.js"
import { BridgeError } from "../../shared/errors.js"
import {
  collectImageHashes,
  countSnapshots,
  snapshotToLayout,
  type LayoutNode,
} from "../../shared/node-schema.js"
import { base64ToBytes } from "../../shared/protocol.js"
import { isLayoutPositioning, isLayoutSizing } from "../../shared/auto-layout.js"
import { isWritableEffectType, normalizeEffect, type EffectInput } from "../../shared/effects.js"
import { sceneToSnapshot, summarizeNode } from "./snapshot.js"

/** 命令执行结果。二进制由主线程分片发给 UI。 */
export interface CommandOutput {
  result: unknown
  binaries?: Record<string, Uint8Array>
}

type ChildrenParent = BaseNode & ChildrenMixin

/**
 * 执行桥方法。
 *
 * @param method 方法名
 * @param params 参数
 */
export async function runCommand(method: string, params: unknown): Promise<CommandOutput> {
  await figma.currentPage.loadAsync()
  const args = asRecord(params)
  switch (method) {
    case "get_document_info":
      return { result: getDocumentInfo() }
    case "get_current_page":
      return { result: getCurrentPage() }
    case "set_current_page":
      return { result: await setCurrentPage(str(args.pageId, "pageId")) }
    case "get_selection":
      return { result: { nodes: figma.currentPage.selection.map(summarizeNode) } }
    case "get_node":
      return getNode(str(args.nodeId, "nodeId"), optionalString(args.detail) ?? "layout", optionalInt(args.maxDepth, 2))
    case "get_node_tree":
      return getNodeTree(str(args.nodeId, "nodeId"), optionalInt(args.maxDepth, 3))
    case "read_for_implement":
      return readForImplement(optionalString(args.nodeId))
    case "export_node":
      return exportNode(
        str(args.nodeId, "nodeId"),
        optionalString(args.format) ?? "PNG",
        optionalNumber(args.scale, 2)
      )
    case "create_frame":
      return createShape("FRAME", args)
    case "create_rectangle":
      return createShape("RECTANGLE", args)
    case "create_ellipse":
      return createShape("ELLIPSE", args)
    case "create_text":
      return createText(args)
    case "create_image":
      return createImage(args)
    case "update_node":
      return updateNode(args)
    case "set_fill":
      return setFill(
        str(args.nodeId, "nodeId"),
        args.fill && typeof args.fill === "object" ? asRecord(args.fill) : undefined,
        args.clear === true
      )
    case "set_stroke":
      return setStroke(str(args.nodeId, "nodeId"), asRecord(args.color), num(args.weight, "weight"))
    case "set_effects":
      return setEffects(
        str(args.nodeId, "nodeId"),
        Array.isArray(args.effects) ? args.effects : undefined,
        args.clear === true
      )
    case "set_corner_radius":
      return setCornerRadius(args)
    case "set_text_style":
      return setTextStyle(args)
    case "set_auto_layout":
      return setAutoLayout(args)
    case "move_node":
      return moveNode(args)
    case "delete_node":
      return deleteNode(str(args.nodeId, "nodeId"))
    default:
      throw new BridgeError("INVALID_ARGS", `未知方法：${method}`)
  }
}

/**
 * 当前文件与页面列表。
 */
function getDocumentInfo() {
  return {
    fileName: figma.root.name,
    currentPageId: figma.currentPage.id,
    pages: figma.root.children
      .filter((node) => node.type === "PAGE")
      .map((page) => ({ id: page.id, name: page.name })),
  }
}

/**
 * 当前页摘要。
 */
function getCurrentPage() {
  return {
    id: figma.currentPage.id,
    name: figma.currentPage.name,
    children: figma.currentPage.children.map(summarizeNode),
    selection: figma.currentPage.selection.map(summarizeNode),
  }
}

/**
 * 切页。
 */
async function setCurrentPage(pageId: string) {
  const node = await figma.getNodeByIdAsync(pageId)
  if (!node || node.type !== "PAGE") {
    throw new BridgeError("NODE_NOT_FOUND", `找不到页面 ${pageId}`)
  }
  await node.loadAsync()
  await figma.setCurrentPageAsync(node)
  return getCurrentPage()
}

/**
 * 按 detail 读节点。
 */
async function getNode(nodeId: string, detail: string, maxDepth: number): Promise<CommandOutput> {
  const node = await requireScene(nodeId)
  if (detail === "summary") {
    return { result: summarizeNode(node) }
  }
  if (detail === "rest_json") {
    const bytes = await exportRestJson(node)
    return { result: JSON.parse(new TextDecoder().decode(bytes)) }
  }
  if (detail !== "layout") {
    throw new BridgeError("INVALID_ARGS", `不支持的 detail：${detail}`)
  }
  const snapshot = await sceneToSnapshot(node)
  return { result: snapshotToLayout(snapshot, clampDepth(maxDepth)) }
}

/**
 * layout 树。
 */
async function getNodeTree(nodeId: string, maxDepth: number): Promise<CommandOutput> {
  const node = await requireScene(nodeId)
  const snapshot = await sceneToSnapshot(node)
  return { result: snapshotToLayout(snapshot, clampDepth(maxDepth)) }
}

/**
 * 像素级打包。
 */
async function readForImplement(nodeId: string | undefined): Promise<CommandOutput> {
  let targetId = nodeId
  if (!targetId) {
    if (figma.currentPage.selection.length !== 1) {
      throw new BridgeError("SELECTION_INVALID", "像素级读取需要恰好选中 1 个节点，或传入 nodeId")
    }
    targetId = figma.currentPage.selection[0].id
  }
  const node = await requireScene(targetId)
  const snapshot = await sceneToSnapshot(node)
  const layout = snapshotToLayout(snapshot, MAX_TREE_DEPTH)
  const nodeCount = countSnapshots(snapshot)
  const warnings: string[] = []
  if (nodeCount > LARGE_TREE_THRESHOLD) {
    warnings.push("LARGE_TREE")
  }
  collectLayoutWarnings(layout, warnings)

  const binaries: Record<string, Uint8Array> = {}
  const preview = await exportBytes(node, "PNG", 2)
  binaries.preview = preview

  let wroteRest = false
  try {
    binaries.rest = await exportRestJson(node)
    wroteRest = true
  } catch (err) {
    if (err instanceof BridgeError && err.code === "UNSUPPORTED_EXPORT_FORMAT") {
      warnings.push("REST_JSON_UNSUPPORTED")
    } else {
      throw err
    }
  }

  for (const hash of collectImageHashes(snapshot)) {
    try {
      const image = figma.getImageByHash(hash)
      if (!image) {
        warnings.push(`IMAGE_HASH_FAILED:${hash}`)
        continue
      }
      binaries[`asset:${hash}`] = new Uint8Array(await image.getBytesAsync())
    } catch {
      warnings.push(`IMAGE_HASH_FAILED:${hash}`)
    }
  }

  const meta = {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    width: "width" in node ? node.width : 0,
    height: "height" in node ? node.height : 0,
    nodeCount,
    truncatedByDepth: true,
    wroteRest,
    warnings,
    files: ["node.json", "preview.png", wroteRest ? "rest.json" : null, "meta.json"].filter(Boolean),
  }

  return { result: { meta, node: layout }, binaries }
}

/**
 * 导出可视格式。
 */
async function exportNode(nodeId: string, format: string, scale: number): Promise<CommandOutput> {
  const node = await requireScene(nodeId)
  if (scale <= 0) {
    throw new BridgeError("INVALID_ARGS", "scale 必须大于 0")
  }
  const bytes = await exportBytes(node, format, scale)
  return {
    result: {
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0,
      format,
      scale,
    },
    binaries: { file: bytes },
  }
}

/**
 * 创建形状。
 */
async function createShape(kind: "FRAME" | "RECTANGLE" | "ELLIPSE", args: Record<string, unknown>): Promise<CommandOutput> {
  const parent = await resolveParent(optionalString(args.parentId))
  let created: SceneNode | null = null
  try {
    created =
      kind === "FRAME" ? figma.createFrame() : kind === "RECTANGLE" ? figma.createRectangle() : figma.createEllipse()
    created.x = num(args.x, "x")
    created.y = num(args.y, "y")
    created.resize(num(args.width, "width"), num(args.height, "height"))
    if (typeof args.name === "string") {
      created.name = args.name
    }
    parent.appendChild(created)
    if (args.fill && "fills" in created) {
      created.fills = [solidPaint(asRecord(args.fill))]
    }
    if (kind === "RECTANGLE" && typeof args.cornerRadius === "number" && "cornerRadius" in created) {
      created.cornerRadius = args.cornerRadius
    }
    return { result: await layoutSummary(created) }
  } catch (err) {
    created?.remove()
    throw toCommandError(err)
  }
}

/**
 * 创建文本。
 */
async function createText(args: Record<string, unknown>): Promise<CommandOutput> {
  const parent = await resolveParent(optionalString(args.parentId))
  const text = figma.createText()
  const warnings: string[] = []
  try {
    const font = await loadFontForWrite(args.fontName ? asRecord(args.fontName) : undefined, warnings)
    text.fontName = font
    if (typeof args.fontSize === "number") {
      text.fontSize = args.fontSize
    }
    text.characters = String(args.characters ?? "")
    text.x = num(args.x, "x")
    text.y = num(args.y, "y")
    if (args.fill) {
      text.fills = [solidPaint(asRecord(args.fill))]
    }
    parent.appendChild(text)
    const summary = await layoutSummary(text)
    return { result: { ...summary, warnings } }
  } catch (err) {
    text.remove()
    throw toCommandError(err)
  }
}

/**
 * 用本地图片或 SVG 创建节点。
 */
async function createImage(args: Record<string, unknown>): Promise<CommandOutput> {
  const parent = await resolveParent(optionalString(args.parentId))
  const x = num(args.x, "x")
  const y = num(args.y, "y")
  const width = num(args.width, "width")
  const height = num(args.height, "height")
  const scaleMode = optionalString(args.scaleMode) ?? "FILL"
  const allowedModes = ["FILL", "FIT", "CROP", "TILE"]
  if (!allowedModes.includes(scaleMode)) {
    throw new BridgeError("INVALID_ARGS", `不支持的 scaleMode：${scaleMode}`)
  }

  let created: SceneNode | null = null
  try {
    const svgText = optionalString(args.svgText)
    if (svgText) {
      created = figma.createNodeFromSvg(svgText)
      created.x = x
      created.y = y
      created.resize(width, height)
      if (typeof args.name === "string") {
        created.name = args.name
      }
      parent.appendChild(created)
      return { result: await layoutSummary(created) }
    }

    const imageBase64 = optionalString(args.imageBase64)
    if (!imageBase64) {
      throw new BridgeError("INVALID_ARGS", "需要 imageBase64 或 svgText")
    }
    const image = figma.createImage(base64ToBytes(imageBase64))
    created = figma.createRectangle()
    created.x = x
    created.y = y
    created.resize(width, height)
    if (typeof args.name === "string") {
      created.name = args.name
    }
    if (typeof args.cornerRadius === "number") {
      created.cornerRadius = args.cornerRadius
    }
    created.fills = [
      {
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode: scaleMode as ImagePaint["scaleMode"],
      },
    ]
    parent.appendChild(created)
    return { result: await layoutSummary(created) }
  } catch (err) {
    created?.remove()
    throw toCommandError(err)
  }
}

/**
 * 更新基础属性。
 */
async function updateNode(args: Record<string, unknown>): Promise<CommandOutput> {
  const node = await requireScene(str(args.nodeId, "nodeId"))
  const applied: string[] = []
  const failed: string[] = []
  applyField("name", args.name, () => {
    node.name = String(args.name)
  }, applied, failed)
  applyField("x", args.x, () => {
    if (!("x" in node)) throw new Error("no x")
    node.x = Number(args.x)
  }, applied, failed)
  applyField("y", args.y, () => {
    if (!("y" in node)) throw new Error("no y")
    node.y = Number(args.y)
  }, applied, failed)
  applyField("width", args.width, () => {
    if (!("resize" in node) || !("height" in node)) throw new Error("no resize")
    node.resize(Number(args.width), "height" in node && args.height === undefined ? node.height : Number(args.height ?? node.height))
  }, applied, failed)
  if (args.height !== undefined && args.width === undefined) {
    applyField("height", args.height, () => {
      if (!("resize" in node) || !("width" in node)) throw new Error("no resize")
      node.resize(node.width, Number(args.height))
    }, applied, failed)
  }
  applyField("visible", args.visible, () => {
    node.visible = Boolean(args.visible)
  }, applied, failed)
  applyField("opacity", args.opacity, () => {
    if (!("opacity" in node)) throw new Error("no opacity")
    node.opacity = Number(args.opacity)
  }, applied, failed)
  applyField("rotation", args.rotation, () => {
    if (!("rotation" in node)) throw new Error("no rotation")
    node.rotation = Number(args.rotation)
  }, applied, failed)
  applyField("horizontalSizing", args.horizontalSizing, () => {
    applyHorizontalSizing(node, args.horizontalSizing)
  }, applied, failed)
  applyField("verticalSizing", args.verticalSizing, () => {
    applyVerticalSizing(node, args.verticalSizing)
  }, applied, failed)
  applyField("layoutPositioning", args.layoutPositioning, () => {
    applyLayoutPositioning(node, args.layoutPositioning)
  }, applied, failed)

  if (failed.length > 0) {
    throw new BridgeError("WRITE_PARTIAL_DENIED", `部分属性无法写入节点 ${node.id}`, { applied, failed })
  }
  return { result: await layoutSummary(node) }
}

/**
 * 纯色填充。
 */
async function setFill(nodeId: string, fill: Record<string, unknown> | undefined, clear?: boolean): Promise<CommandOutput> {
  const node = await requireScene(nodeId)
  if (!("fills" in node)) {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${nodeId} 不支持填充`)
  }
  try {
    if (clear) {
      node.fills = []
    } else if (fill) {
      node.fills = [solidPaint(fill)]
    } else {
      throw new BridgeError("INVALID_ARGS", "需要 fill 或 clear")
    }
  } catch (err) {
    if (err instanceof BridgeError) {
      throw err
    }
    throw new BridgeError("WRITE_PARTIAL_DENIED", `无法设置节点 ${nodeId} 的填充`, {
      applied: [],
      failed: ["fills"],
    })
  }
  return { result: await layoutSummary(node) }
}

/**
 * 实线描边。
 */
async function setStroke(nodeId: string, color: Record<string, unknown>, weight: number): Promise<CommandOutput> {
  const node = await requireScene(nodeId)
  if (!("strokes" in node) || !("strokeWeight" in node)) {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${nodeId} 不支持描边`)
  }
  try {
    node.strokes = [solidPaint(color)]
    node.strokeWeight = weight
  } catch {
    throw new BridgeError("WRITE_PARTIAL_DENIED", `无法设置节点 ${nodeId} 的描边`, {
      applied: [],
      failed: ["strokes"],
    })
  }
  return { result: await layoutSummary(node) }
}

/**
 * 写入效果。第一版：背景模糊、图层模糊、投影、内阴影。
 */
async function setEffects(
  nodeId: string,
  rawEffects: unknown[] | undefined,
  clear?: boolean
): Promise<CommandOutput> {
  const node = await requireScene(nodeId)
  if (!("effects" in node)) {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${nodeId} 不支持效果`)
  }
  try {
    if (clear) {
      node.effects = []
    } else if (rawEffects) {
      node.effects = rawEffects.map((item, index) => toPluginEffect(item, index))
    } else {
      throw new BridgeError("INVALID_ARGS", "需要 effects 或 clear")
    }
  } catch (err) {
    if (err instanceof BridgeError) {
      throw err
    }
    throw new BridgeError("WRITE_PARTIAL_DENIED", `无法设置节点 ${nodeId} 的效果`, {
      applied: [],
      failed: ["effects"],
    })
  }
  return { result: await layoutSummary(node) }
}

/**
 * 把 Agent 传入的一层转成 Figma Effect。
 *
 * @param item 原始一层
 * @param index 用于报错
 */
function toPluginEffect(item: unknown, index: number): Effect {
  if (!item || typeof item !== "object") {
    throw new BridgeError("INVALID_ARGS", `effects[${index}] 不是对象`)
  }
  const raw = asRecord(item)
  if (!isWritableEffectType(raw.type)) {
    throw new BridgeError("INVALID_ARGS", `effects[${index}] 类型不支持`)
  }
  let normalized
  try {
    normalized = normalizeEffect({
      type: raw.type,
      radius: Number(raw.radius),
      visible: raw.visible === undefined ? undefined : raw.visible === true,
      spread: typeof raw.spread === "number" ? raw.spread : undefined,
      offset:
        raw.offset && typeof raw.offset === "object"
          ? { x: Number(asRecord(raw.offset).x), y: Number(asRecord(raw.offset).y) }
          : undefined,
      color: raw.color && typeof raw.color === "object" ? asRecord(raw.color) as EffectInput["color"] : undefined,
    })
  } catch (err) {
    throw new BridgeError("INVALID_ARGS", `effects[${index}] ${err instanceof Error ? err.message : String(err)}`)
  }
  if (normalized.type === "BACKGROUND_BLUR" || normalized.type === "LAYER_BLUR") {
    return {
      type: normalized.type,
      radius: normalized.radius,
      visible: normalized.visible,
    }
  }
  const color = normalized.color
  if (!color) {
    throw new BridgeError("INVALID_ARGS", `effects[${index}] 缺少 color`)
  }
  return {
    type: normalized.type,
    radius: normalized.radius,
    visible: normalized.visible,
    spread: normalized.spread ?? 0,
    offset: normalized.offset ?? { x: 0, y: 0 },
    color: { r: color.r, g: color.g, b: color.b, a: color.a },
    blendMode: "NORMAL",
  }
}

/**
 * 圆角。
 */
async function setCornerRadius(args: Record<string, unknown>): Promise<CommandOutput> {
  const node = await requireScene(str(args.nodeId, "nodeId"))
  const corners = [args.topLeft, args.topRight, args.bottomRight, args.bottomLeft]
  const hasCorners = corners.some((value) => typeof value === "number")
  try {
    if (hasCorners) {
      if (!("topLeftRadius" in node)) {
        throw new Error("no corners")
      }
      if (typeof args.topLeft === "number") node.topLeftRadius = args.topLeft
      if (typeof args.topRight === "number") node.topRightRadius = args.topRight
      if (typeof args.bottomRight === "number") node.bottomRightRadius = args.bottomRight
      if (typeof args.bottomLeft === "number") node.bottomLeftRadius = args.bottomLeft
    } else if (typeof args.radius === "number" && "topLeftRadius" in node) {
      node.topLeftRadius = args.radius
      node.topRightRadius = args.radius
      node.bottomRightRadius = args.radius
      node.bottomLeftRadius = args.radius
    } else {
      throw new BridgeError("INVALID_ARGS", "需要 radius 或四角数值")
    }
  } catch (err) {
    throw toCommandError(err)
  }
  return { result: await layoutSummary(node) }
}

/**
 * 文本样式。
 */
async function setTextStyle(args: Record<string, unknown>): Promise<CommandOutput> {
  const node = await requireScene(str(args.nodeId, "nodeId"))
  if (node.type !== "TEXT") {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${node.id} 不是文本`)
  }
  const warnings: string[] = []
  try {
    const font = await loadFontForWrite(args.fontName ? asRecord(args.fontName) : nodeFont(node), warnings)
    node.fontName = font
    if (typeof args.fontSize === "number") {
      node.fontSize = args.fontSize
    }
    if (args.lineHeight && typeof args.lineHeight === "object") {
      const line = asRecord(args.lineHeight)
      if (line.unit === "AUTO") {
        node.lineHeight = { unit: "AUTO" }
      } else if (line.unit === "PIXELS" || line.unit === "PERCENT") {
        node.lineHeight = { unit: line.unit, value: Number(line.value) }
      }
    }
    if (args.letterSpacing && typeof args.letterSpacing === "object") {
      const spacing = asRecord(args.letterSpacing)
      if (spacing.unit === "PIXELS" || spacing.unit === "PERCENT") {
        node.letterSpacing = { unit: spacing.unit, value: Number(spacing.value) }
      }
    }
    if (typeof args.textAlignHorizontal === "string") {
      node.textAlignHorizontal = args.textAlignHorizontal as TextNode["textAlignHorizontal"]
    }
    if (typeof args.characters === "string") {
      node.characters = args.characters
    }
  } catch (err) {
    throw toCommandError(err)
  }
  const summary = await layoutSummary(node)
  return { result: { ...summary, warnings } }
}

/**
 * Auto Layout。
 */
async function setAutoLayout(args: Record<string, unknown>): Promise<CommandOutput> {
  const node = await requireScene(str(args.nodeId, "nodeId"))
  if (!("layoutMode" in node)) {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${node.id} 不支持 Auto Layout`)
  }
  try {
    node.layoutMode = args.layoutMode as "NONE" | "HORIZONTAL" | "VERTICAL"
    if (typeof args.itemSpacing === "number") {
      node.itemSpacing = args.itemSpacing
    }
    if (typeof args.padding === "number") {
      node.paddingTop = args.padding
      node.paddingRight = args.padding
      node.paddingBottom = args.padding
      node.paddingLeft = args.padding
    } else if (args.padding && typeof args.padding === "object") {
      const padding = asRecord(args.padding)
      node.paddingTop = Number(padding.top)
      node.paddingRight = Number(padding.right)
      node.paddingBottom = Number(padding.bottom)
      node.paddingLeft = Number(padding.left)
    }
    if (typeof args.primaryAxisAlign === "string") {
      node.primaryAxisAlignItems = args.primaryAxisAlign as FrameNode["primaryAxisAlignItems"]
    }
    if (typeof args.counterAxisAlign === "string") {
      node.counterAxisAlignItems = args.counterAxisAlign as FrameNode["counterAxisAlignItems"]
    }
    applyHorizontalSizing(node, args.horizontalSizing)
    applyVerticalSizing(node, args.verticalSizing)
  } catch (err) {
    throw toCommandError(err)
  }
  return { result: await layoutSummary(node) }
}

/**
 * 设置横向适应。必须在 layoutMode 之后调用。
 *
 * @param node 目标节点
 * @param value FIXED / HUG / FILL
 */
function applyHorizontalSizing(node: SceneNode, value: unknown): void {
  if (value === undefined) {
    return
  }
  if (!isLayoutSizing(value)) {
    throw new BridgeError("INVALID_ARGS", `不支持的 horizontalSizing：${String(value)}`)
  }
  if (!("layoutSizingHorizontal" in node)) {
    throw new Error("no horizontal sizing")
  }
  node.layoutSizingHorizontal = value
}

/**
 * 设置纵向适应。
 *
 * @param node 目标节点
 * @param value FIXED / HUG / FILL
 */
function applyVerticalSizing(node: SceneNode, value: unknown): void {
  if (value === undefined) {
    return
  }
  if (!isLayoutSizing(value)) {
    throw new BridgeError("INVALID_ARGS", `不支持的 verticalSizing：${String(value)}`)
  }
  if (!("layoutSizingVertical" in node)) {
    throw new Error("no vertical sizing")
  }
  node.layoutSizingVertical = value
}

/**
 * 设置子项绝对或自动定位。
 *
 * @param node 目标节点
 * @param value AUTO / ABSOLUTE
 */
function applyLayoutPositioning(node: SceneNode, value: unknown): void {
  if (value === undefined) {
    return
  }
  if (!isLayoutPositioning(value)) {
    throw new BridgeError("INVALID_ARGS", `不支持的 layoutPositioning：${String(value)}`)
  }
  if (!("layoutPositioning" in node)) {
    throw new Error("no layoutPositioning")
  }
  node.layoutPositioning = value
}

/**
 * 移动节点。
 */
async function moveNode(args: Record<string, unknown>): Promise<CommandOutput> {
  const node = await requireScene(str(args.nodeId, "nodeId"))
  const nodeId = node.id
  if (args.parentId) {
    const parent = await resolveParent(String(args.parentId))
    const index = typeof args.index === "number" ? args.index : parent.children.length
    parent.insertChild(Math.min(index, parent.children.length), node)
  }
  if (!("x" in node) || !("y" in node)) {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${nodeId} 不能移动`)
  }
  try {
    node.x = num(args.x, "x")
    node.y = num(args.y, "y")
  } catch {
    throw new BridgeError("WRITE_PARTIAL_DENIED", `无法移动节点 ${nodeId}`, {
      applied: args.parentId ? ["parentId"] : [],
      failed: ["x", "y"],
    })
  }
  return { result: await layoutSummary(node) }
}

/**
 * 删除节点。
 */
async function deleteNode(nodeId: string): Promise<CommandOutput> {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node) {
    throw new BridgeError("NODE_NOT_FOUND", `找不到节点 ${nodeId}`)
  }
  if (node.type === "PAGE" || node.type === "DOCUMENT") {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `不能删除 ${node.type}`)
  }
  const summary = summarizeNode(node)
  node.remove()
  return { result: { deleted: summary } }
}

/**
 * 取场景节点。
 */
async function requireScene(nodeId: string): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || node.removed) {
    throw new BridgeError("NODE_NOT_FOUND", `找不到节点 ${nodeId}`)
  }
  if (!("type" in node) || node.type === "PAGE" || node.type === "DOCUMENT") {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${nodeId} 不是可导出的场景节点`)
  }
  return node as SceneNode
}

/**
 * 解析父节点。
 */
async function resolveParent(parentId: string | undefined): Promise<ChildrenParent> {
  if (!parentId) {
    return figma.currentPage
  }
  const node = await figma.getNodeByIdAsync(parentId)
  if (!node) {
    throw new BridgeError("NODE_NOT_FOUND", `找不到父节点 ${parentId}`)
  }
  const allowed = ["PAGE", "FRAME", "GROUP", "SECTION", "COMPONENT"]
  if (!allowed.includes(node.type) || !("appendChild" in node)) {
    throw new BridgeError("UNSUPPORTED_NODE_TYPE", `节点 ${parentId} 不能作为父级`)
  }
  return node as ChildrenParent
}

/**
 * 导出 PNG/JPG/SVG/PDF。
 */
async function exportBytes(node: SceneNode, format: string, scale: number): Promise<Uint8Array> {
  const allowed = ["PNG", "JPG", "SVG", "PDF"]
  if (!allowed.includes(format)) {
    throw new BridgeError("INVALID_ARGS", `不支持的导出格式：${format}`)
  }
  try {
    const bytes = await node.exportAsync({
      format: format as "PNG" | "JPG" | "SVG" | "PDF",
      constraint: format === "SVG" || format === "PDF" ? undefined : { type: "SCALE", value: scale },
    })
    const out = new Uint8Array(bytes)
    if (out.byteLength > MAX_PAYLOAD_BYTES) {
      throw new BridgeError(
        "PAYLOAD_TOO_LARGE",
        `导出体积 ${out.byteLength} 字节超过上限，请降低 scale 或改导出 SVG`
      )
    }
    return out
  } catch (err) {
    if (err instanceof BridgeError) {
      throw err
    }
    throw new BridgeError("EXPORT_FAILED", `导出节点 ${node.id} 失败`)
  }
}

/**
 * 导出 REST JSON。
 */
async function exportRestJson(node: SceneNode): Promise<Uint8Array> {
  try {
    const bytes = await node.exportAsync({ format: "JSON_REST_V1" })
    const out = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(JSON.stringify(bytes))
    if (out.byteLength > MAX_PAYLOAD_BYTES) {
      throw new BridgeError("PAYLOAD_TOO_LARGE", `REST JSON 体积 ${out.byteLength} 字节超过上限`)
    }
    return out
  } catch (err) {
    if (err instanceof BridgeError) {
      throw err
    }
    throw new BridgeError("UNSUPPORTED_EXPORT_FORMAT", `当前 Figma 不支持 JSON_REST_V1（节点 ${node.id}）`)
  }
}

/**
 * 加载写入用字体。
 */
async function loadFontForWrite(
  specified: Record<string, unknown> | undefined,
  warnings: string[]
): Promise<FontName> {
  if (specified) {
    const font = { family: String(specified.family), style: String(specified.style) }
    try {
      await figma.loadFontAsync(font)
      return font
    } catch {
      throw new BridgeError("FONT_NOT_AVAILABLE", `无法加载字体 ${font.family} ${font.style}`, {
        available: listUsedFonts(),
      })
    }
  }
  const defaults: FontName[] = [
    { family: "Inter", style: "Regular" },
    { family: "Roboto", style: "Regular" },
  ]
  for (const font of defaults) {
    try {
      await figma.loadFontAsync(font)
      warnings.push(`使用默认字体 ${font.family} ${font.style}`)
      return font
    } catch {
      // 试下一个
    }
  }
  throw new BridgeError("FONT_NOT_AVAILABLE", "无法加载 Inter Regular 或 Roboto Regular", {
    available: listUsedFonts(),
  })
}

/**
 * 当前页已用字体，最多 10 个。
 */
function listUsedFonts(): string[] {
  const found = new Set<string>()
  const walk = (node: BaseNode) => {
    if (found.size >= 10) {
      return
    }
    if (node.type === "TEXT" && node.fontName !== figma.mixed) {
      found.add(`${node.fontName.family} ${node.fontName.style}`)
    }
    if ("children" in node) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }
  walk(figma.currentPage)
  return [...found]
}

/**
 * 文本节点当前字体。
 */
function nodeFont(node: TextNode): Record<string, unknown> | undefined {
  if (node.fontName === figma.mixed) {
    return undefined
  }
  return { family: node.fontName.family, style: node.fontName.style }
}

/**
 * 成功写入后返回 layout 摘要。
 */
async function layoutSummary(node: SceneNode): Promise<LayoutNode> {
  const snapshot = await sceneToSnapshot(node)
  return snapshotToLayout(snapshot, 0)
}

/**
 * 纯色 Paint。
 */
function solidPaint(fill: Record<string, unknown>): SolidPaint {
  return {
    type: "SOLID",
    color: { r: num(fill.r, "r"), g: num(fill.g, "g"), b: num(fill.b, "b") },
    opacity: typeof fill.a === "number" ? fill.a : 1,
  }
}

/**
 * 收集旋转警告。
 */
function collectLayoutWarnings(node: LayoutNode, warnings: string[]): void {
  if (node.warnings) {
    for (const item of node.warnings) {
      if (!warnings.includes(item)) {
        warnings.push(item)
      }
    }
  }
  for (const child of node.children ?? []) {
    collectLayoutWarnings(child, warnings)
  }
}

/**
 * 尝试写字段。
 */
function applyField(
  key: string,
  value: unknown,
  write: () => void,
  applied: string[],
  failed: string[]
): void {
  if (value === undefined) {
    return
  }
  try {
    write()
    applied.push(key)
  } catch {
    failed.push(key)
  }
}

/**
 * 深度限制。
 */
function clampDepth(value: number): number {
  if (!Number.isFinite(value)) {
    return 2
  }
  return Math.min(MAX_TREE_DEPTH, Math.max(0, Math.floor(value)))
}

/**
 * 未知值收成对象。
 */
function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

/**
 * 必填字符串。
 */
function str(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BridgeError("INVALID_ARGS", `缺少参数 ${name}`)
  }
  return value
}

/**
 * 必填数字。
 */
function num(value: unknown, name: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new BridgeError("INVALID_ARGS", `参数 ${name} 必须是数字`)
  }
  return value
}

/**
 * 可选字符串。
 */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * 可选整数。
 */
function optionalInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback
}

/**
 * 可选数字。
 */
function optionalNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/**
 * 把未知错误收成桥错误。
 */
function toCommandError(err: unknown): BridgeError {
  if (err instanceof BridgeError) {
    return err
  }
  return new BridgeError("INVALID_ARGS", err instanceof Error ? err.message : String(err))
}
