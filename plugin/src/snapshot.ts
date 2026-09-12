/// <reference types="@figma/plugin-typings" />

/**
 * 把 Figma SceneNode 收成可测试的 LayoutSnapshot。
 */

import {
  serializeColor,
  type AutoLayout,
  type Box,
  type Effect,
  type LayoutChild,
  type LayoutSnapshot,
  type Paint,
  type TextStyle,
} from "../../shared/node-schema.js"

/**
 * 递归拍摄节点快照。
 *
 * @param node 场景节点
 * @param ancestorRotated 祖先是否旋转
 */
export async function sceneToSnapshot(node: SceneNode, ancestorRotated = false): Promise<LayoutSnapshot> {
  const children: LayoutSnapshot[] = []
  if ("children" in node) {
    for (const child of node.children) {
      children.push(
        await sceneToSnapshot(child, ancestorRotated || ("rotation" in node && node.rotation !== 0))
      )
    }
  }

  let component: { id: string; name: string } | null = null
  if (node.type === "INSTANCE") {
    try {
      const main = await node.getMainComponentAsync()
      if (main) {
        component = { id: main.id, name: main.name }
      }
    } catch {
      component = null
    }
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    opacity: "opacity" in node ? node.opacity : 1,
    rotation: "rotation" in node ? node.rotation : 0,
    x: "x" in node ? node.x : 0,
    y: "y" in node ? node.y : 0,
    width: "width" in node ? node.width : 0,
    height: "height" in node ? node.height : 0,
    absoluteBox: readAbsoluteBox(node),
    renderBox: readRenderBox(node),
    fills: readPaints(node, "fills"),
    strokes: readPaints(node, "strokes"),
    strokeWeight: readStrokeWeight(node),
    effects: readEffects(node),
    cornerRadius: readCornerRadius(node),
    constraints: readConstraints(node),
    layout: readAutoLayout(node),
    layoutChild: readLayoutChild(node),
    text: readText(node),
    component,
    ancestorRotated,
    children,
  }
}

/**
 * 节点摘要，给选区和页面列表用。
 *
 * @param node 场景或页面节点
 */
export function summarizeNode(node: BaseNode): {
  id: string
  name: string
  type: string
  width?: number
  height?: number
  childCount?: number
} {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    width: "width" in node ? node.width : undefined,
    height: "height" in node ? node.height : undefined,
    childCount: "children" in node ? node.children.length : undefined,
  }
}

/**
 * 绝对包围盒。
 */
function readAbsoluteBox(node: SceneNode): Box {
  if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
    const box = node.absoluteBoundingBox
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }
  return {
    x: "x" in node ? node.x : 0,
    y: "y" in node ? node.y : 0,
    width: "width" in node ? node.width : 0,
    height: "height" in node ? node.height : 0,
  }
}

/**
 * 渲染包围盒。
 */
function readRenderBox(node: SceneNode): Box | null {
  if ("absoluteRenderBounds" in node && node.absoluteRenderBounds) {
    const box = node.absoluteRenderBounds
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }
  return null
}

/**
 * 读取 fills 或 strokes。
 */
function readPaints(node: SceneNode, key: "fills" | "strokes"): Paint[] {
  const value = key === "fills" && "fills" in node ? node.fills : key === "strokes" && "strokes" in node ? node.strokes : null
  if (!Array.isArray(value)) {
    return []
  }
  const paints: Paint[] = []
  for (const paint of value) {
    const item: Paint = {
      type: paint.type,
      visible: paint.visible !== false,
      opacity: paint.opacity ?? 1,
    }
    if (paint.type === "SOLID") {
      item.color = serializeColor(paint.color.r, paint.color.g, paint.color.b, paint.opacity ?? 1)
    }
    if (paint.type === "IMAGE" && "imageHash" in paint && paint.imageHash) {
      item.imageHash = paint.imageHash
    }
    paints.push(item)
  }
  return paints
}

/**
 * 描边宽度。
 */
function readStrokeWeight(node: SceneNode): number | null {
  if (!("strokeWeight" in node) || node.strokeWeight === figma.mixed) {
    return null
  }
  return node.strokeWeight
}

/**
 * 效果。阴影带齐字段；模糊带 radius。
 */
function readEffects(node: SceneNode): Effect[] {
  if (!("effects" in node) || !Array.isArray(node.effects)) {
    return []
  }
  return node.effects.map((effect) => {
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      return {
        type: effect.type,
        visible: effect.visible,
        offset: { x: effect.offset.x, y: effect.offset.y },
        radius: effect.radius,
        spread: effect.spread,
        color: serializeColor(effect.color.r, effect.color.g, effect.color.b, effect.color.a),
      }
    }
    if (effect.type === "BACKGROUND_BLUR" || effect.type === "LAYER_BLUR") {
      return { type: effect.type, visible: effect.visible, radius: effect.radius }
    }
    return { type: effect.type, visible: effect.visible }
  })
}

/**
 * 圆角。
 */
function readCornerRadius(node: SceneNode): number | [number, number, number, number] | null {
  if (!("cornerRadius" in node)) {
    return null
  }
  if (node.cornerRadius !== figma.mixed) {
    return node.cornerRadius ?? null
  }
  if (
    "topLeftRadius" in node &&
    "topRightRadius" in node &&
    "bottomRightRadius" in node &&
    "bottomLeftRadius" in node
  ) {
    return [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius]
  }
  return null
}

/**
 * 约束。
 */
function readConstraints(node: SceneNode): { horizontal: string; vertical: string } | null {
  if (!("constraints" in node)) {
    return null
  }
  return { horizontal: node.constraints.horizontal, vertical: node.constraints.vertical }
}

/**
 * Auto Layout。
 */
function readAutoLayout(node: SceneNode): AutoLayout | null {
  if (!("layoutMode" in node)) {
    return null
  }
  const mode = node.layoutMode
  if (mode === "NONE") {
    return null
  }
  return {
    mode: mode === "GRID" ? "GRID" : mode,
    padding: {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    },
    itemSpacing: node.itemSpacing,
    primaryAxisAlign: node.primaryAxisAlignItems,
    counterAxisAlign: node.counterAxisAlignItems,
    primaryAxisSizing: node.primaryAxisSizingMode,
    counterAxisSizing: node.counterAxisSizingMode,
    layoutWrap: "layoutWrap" in node ? node.layoutWrap : null,
  }
}

/**
 * 子项约束。
 */
function readLayoutChild(node: SceneNode): LayoutChild | null {
  if (!("layoutAlign" in node)) {
    return null
  }
  return {
    layoutAlign: node.layoutAlign,
    layoutGrow: node.layoutGrow,
    horizontalSizing: "layoutSizingHorizontal" in node ? node.layoutSizingHorizontal : null,
    verticalSizing: "layoutSizingVertical" in node ? node.layoutSizingVertical : null,
    minWidth: "minWidth" in node ? node.minWidth : null,
    maxWidth: "maxWidth" in node ? node.maxWidth : null,
    minHeight: "minHeight" in node ? node.minHeight : null,
    maxHeight: "maxHeight" in node ? node.maxHeight : null,
  }
}

/**
 * 文本节点级样式。
 */
function readText(node: SceneNode): TextStyle | null {
  if (node.type !== "TEXT") {
    return null
  }
  const font = firstFont(node)
  const lineHeight = node.lineHeight === figma.mixed ? { unit: "AUTO" as const, value: null } : normalizeLineHeight(node.lineHeight)
  const letterSpacing =
    node.letterSpacing === figma.mixed
      ? { unit: "PIXELS" as const, value: 0 }
      : { unit: node.letterSpacing.unit, value: node.letterSpacing.value }
  return {
    characters: node.characters,
    fontFamily: font.family,
    fontStyle: font.style,
    fontSize: node.fontSize === figma.mixed ? Number(node.getRangeFontSize(0, 1)) : node.fontSize,
    fontWeight:
      "fontWeight" in node && node.fontWeight !== figma.mixed ? Number(node.fontWeight) : null,
    lineHeight,
    letterSpacing,
    textAlignHorizontal: node.textAlignHorizontal,
    textAlignVertical: node.textAlignVertical,
    textAutoResize: node.textAutoResize,
  }
}

/**
 * 取节点级或首字字体。
 */
function firstFont(node: TextNode): FontName {
  if (node.fontName !== figma.mixed) {
    return node.fontName
  }
  if (node.characters.length === 0) {
    return { family: "Inter", style: "Regular" }
  }
  const font = node.getRangeFontName(0, 1)
  if (font === figma.mixed) {
    return { family: "Inter", style: "Regular" }
  }
  return font
}

/**
 * 行高归一。
 */
function normalizeLineHeight(
  value: LineHeight
): { unit: "AUTO" | "PIXELS" | "PERCENT"; value: number | null } {
  if (value.unit === "AUTO") {
    return { unit: "AUTO", value: null }
  }
  return { unit: value.unit, value: value.value }
}
