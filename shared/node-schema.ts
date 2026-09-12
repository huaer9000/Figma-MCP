/**
 * 像素级 layout 合同与纯函数序列化。
 */

import { TEXT_CHAR_LIMIT } from "./constants.js"

/** 轴对齐矩形。 */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** 同时给出 0–1、hex、css 的颜色。 */
export interface Color {
  r: number
  g: number
  b: number
  a: number
  hex: string
  css: string
}

/** 填充或描边。 */
export interface Paint {
  type: string
  visible: boolean
  opacity: number
  color?: Color
  imageHash?: string
}

/** 效果。 */
export interface Effect {
  type: string
  visible: boolean
  offset?: { x: number; y: number }
  radius?: number
  spread?: number
  color?: Color
}

/** 节点级文本样式。 */
export interface TextStyle {
  characters: string
  fontFamily: string
  fontStyle: string
  fontSize: number
  fontWeight: number | null
  lineHeight: { unit: "AUTO" | "PIXELS" | "PERCENT"; value: number | null }
  letterSpacing: { unit: "PIXELS" | "PERCENT"; value: number }
  textAlignHorizontal: string
  textAlignVertical: string
  textAutoResize: string
  truncated?: boolean
}

/** Auto Layout 容器。 */
export interface AutoLayout {
  mode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID"
  padding: { top: number; right: number; bottom: number; left: number }
  itemSpacing: number
  primaryAxisAlign: string
  counterAxisAlign: string
  primaryAxisSizing: string
  counterAxisSizing: string
  layoutWrap: string | null
}

/** 相对父容器的子项约束。 */
export interface LayoutChild {
  layoutAlign: string
  layoutGrow: number
  horizontalSizing: string | null
  verticalSizing: string | null
  minWidth: number | null
  maxWidth: number | null
  minHeight: number | null
  maxHeight: number | null
}

/** Agent 使用的 layout 节点。 */
export interface LayoutNode {
  id: string
  name: string
  type: string
  visible: boolean
  opacity: number
  rotation: number
  x: number
  y: number
  width: number
  height: number
  boundsInRoot: Box
  absoluteBox: Box
  renderBoundsInRoot: Box | null
  fills: Paint[]
  strokes: Paint[]
  strokeWeight: number | null
  effects: Effect[]
  cornerRadius: number | [number, number, number, number] | null
  constraints: { horizontal: string; vertical: string } | null
  layout: AutoLayout | null
  layoutChild: LayoutChild | null
  text: TextStyle | null
  component: { id: string; name: string } | null
  imageHashes: string[]
  warnings?: string[]
  children?: LayoutNode[]
}

/** 可脱离 Figma 运行的中间快照，供单测使用。 */
export interface LayoutSnapshot {
  id: string
  name: string
  type: string
  visible: boolean
  opacity: number
  rotation: number
  x: number
  y: number
  width: number
  height: number
  absoluteBox: Box
  renderBox: Box | null
  fills: Paint[]
  strokes: Paint[]
  strokeWeight: number | null
  effects: Effect[]
  cornerRadius: number | [number, number, number, number] | null
  constraints: { horizontal: string; vertical: string } | null
  layout: AutoLayout | null
  layoutChild: LayoutChild | null
  text: TextStyle | null
  component: { id: string; name: string } | null
  ancestorRotated: boolean
  children: LayoutSnapshot[]
}

/**
 * 把 0–1 通道收成 Color 合同。
 *
 * @param r 红 0–1
 * @param g 绿 0–1
 * @param b 蓝 0–1
 * @param a 透明度 0–1
 */
export function serializeColor(r: number, g: number, b: number, a = 1): Color {
  const r8 = Math.round(r * 255)
  const g8 = Math.round(g * 255)
  const b8 = Math.round(b * 255)
  const alpha = Number(a.toFixed(3))
  const hex = `#${toHex(r8)}${toHex(g8)}${toHex(b8)}`
  return { r, g, b, a, hex, css: `rgba(${r8},${g8},${b8},${alpha})` }
}

/**
 * 按根节点包围盒计算 boundsInRoot。
 *
 * @param box 当前节点 absoluteBox
 * @param root 根节点 absoluteBox
 */
export function boundsInRoot(box: Box, root: Box): Box {
  return {
    x: box.x - root.x,
    y: box.y - root.y,
    width: box.width,
    height: box.height,
  }
}

/**
 * 截断超长文本并打标。
 *
 * @param text 原始文本样式
 */
export function clampText(text: TextStyle): TextStyle {
  if (text.characters.length <= TEXT_CHAR_LIMIT) {
    return text
  }
  return {
    ...text,
    characters: text.characters.slice(0, TEXT_CHAR_LIMIT),
    truncated: true,
  }
}

/**
 * 把快照树收成 layout 树。
 *
 * @param snapshot 根快照
 * @param maxDepth 最大深度，0 表示不含 children
 */
export function snapshotToLayout(snapshot: LayoutSnapshot, maxDepth: number): LayoutNode {
  return convert(snapshot, snapshot.absoluteBox, 0, maxDepth, snapshot.rotation !== 0 || snapshot.ancestorRotated)
}

/**
 * 统计快照树节点数。
 *
 * @param snapshot 根快照
 */
export function countSnapshots(snapshot: LayoutSnapshot): number {
  return 1 + snapshot.children.reduce((sum, child) => sum + countSnapshots(child), 0)
}

/**
 * 收集整棵树的 imageHash。
 *
 * @param snapshot 根快照
 */
export function collectImageHashes(snapshot: LayoutSnapshot): string[] {
  const found = new Set<string>()
  walkHashes(snapshot, found)
  return [...found]
}

/**
 * 递归转换。
 */
function convert(
  snapshot: LayoutSnapshot,
  rootBox: Box,
  depth: number,
  maxDepth: number,
  rotated: boolean
): LayoutNode {
  const rotatedHere = rotated || snapshot.rotation !== 0
  const imageHashes = uniqueHashes(snapshot.fills)
  const text = snapshot.text ? clampText(snapshot.text) : null
  const node: LayoutNode = {
    id: snapshot.id,
    name: snapshot.name,
    type: snapshot.type,
    visible: snapshot.visible,
    opacity: snapshot.opacity,
    rotation: snapshot.rotation,
    x: snapshot.x,
    y: snapshot.y,
    width: snapshot.width,
    height: snapshot.height,
    boundsInRoot: boundsInRoot(snapshot.absoluteBox, rootBox),
    absoluteBox: snapshot.absoluteBox,
    renderBoundsInRoot: snapshot.renderBox ? boundsInRoot(snapshot.renderBox, rootBox) : null,
    fills: snapshot.fills,
    strokes: snapshot.strokes,
    strokeWeight: snapshot.strokeWeight,
    effects: snapshot.effects,
    cornerRadius: snapshot.cornerRadius,
    constraints: snapshot.constraints,
    layout: snapshot.layout,
    layoutChild: depth === 0 ? null : snapshot.layoutChild,
    text,
    component: snapshot.component,
    imageHashes,
  }
  if (rotatedHere) {
    node.warnings = ["ROTATED_BOUNDS_APPROX"]
  }
  if (depth < maxDepth && snapshot.children.length > 0) {
    node.children = snapshot.children.map((child) =>
      convert(child, rootBox, depth + 1, maxDepth, rotatedHere)
    )
  }
  return node
}

/**
 * 从 fills 抽出 hash。
 */
function uniqueHashes(fills: Paint[]): string[] {
  const hashes: string[] = []
  for (const fill of fills) {
    if (fill.imageHash && !hashes.includes(fill.imageHash)) {
      hashes.push(fill.imageHash)
    }
  }
  return hashes
}

/**
 * 遍历收集 hash。
 */
function walkHashes(snapshot: LayoutSnapshot, found: Set<string>): void {
  for (const hash of uniqueHashes(snapshot.fills)) {
    found.add(hash)
  }
  for (const child of snapshot.children) {
    walkHashes(child, found)
  }
}

/**
 * 0–255 转两位 hex。
 */
function toHex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase()
}
