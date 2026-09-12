import assert from "node:assert/strict"
import { test } from "node:test"

import { TEXT_CHAR_LIMIT } from "../shared/constants.ts"
import {
  boundsInRoot,
  clampText,
  serializeColor,
  snapshotToLayout,
  type LayoutSnapshot,
  type TextStyle,
} from "../shared/node-schema.ts"

/**
 * 构造最小快照。
 */
function snap(partial: Partial<LayoutSnapshot> & Pick<LayoutSnapshot, "id">): LayoutSnapshot {
  return {
    name: "node",
    type: "FRAME",
    visible: true,
    opacity: 1,
    rotation: 0,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    absoluteBox: { x: 0, y: 0, width: 100, height: 40 },
    renderBox: null,
    fills: [],
    strokes: [],
    strokeWeight: null,
    effects: [],
    cornerRadius: null,
    constraints: null,
    layout: null,
    layoutChild: null,
    text: null,
    component: null,
    ancestorRotated: false,
    children: [],
    ...partial,
  }
}

test("颜色同时给出 hex 与 css", () => {
  const color = serializeColor(1, 0, 0, 0.5)
  assert.equal(color.hex, "#FF0000")
  assert.equal(color.css, "rgba(255,0,0,0.5)")
  assert.equal(color.a, 0.5)
})

test("boundsInRoot 相对根节点相减", () => {
  const box = boundsInRoot({ x: 80, y: 40, width: 10, height: 10 }, { x: 20, y: 10, width: 200, height: 200 })
  assert.deepEqual(box, { x: 60, y: 30, width: 10, height: 10 })
})

test("根节点 boundsInRoot 为 0,0", () => {
  const root = snap({
    id: "1:1",
    absoluteBox: { x: 40, y: 80, width: 375, height: 812 },
    width: 375,
    height: 812,
  })
  const layout = snapshotToLayout(root, 0)
  assert.deepEqual(layout.boundsInRoot, { x: 0, y: 0, width: 375, height: 812 })
  assert.equal(layout.layoutChild, null)
})

test("子节点 boundsInRoot 用 absoluteBox 计算", () => {
  const child = snap({
    id: "2:2",
    x: 16,
    y: 24,
    width: 80,
    height: 20,
    absoluteBox: { x: 56, y: 104, width: 80, height: 20 },
    layoutChild: {
      layoutAlign: "MIN",
      layoutGrow: 0,
      horizontalSizing: "FIXED",
      verticalSizing: "FIXED",
      minWidth: null,
      maxWidth: null,
      minHeight: null,
      maxHeight: null,
    },
  })
  const root = snap({
    id: "1:1",
    absoluteBox: { x: 40, y: 80, width: 375, height: 812 },
    children: [child],
  })
  const layout = snapshotToLayout(root, 2)
  assert.ok(layout.children)
  assert.deepEqual(layout.children[0].boundsInRoot, { x: 16, y: 24, width: 80, height: 20 })
  assert.equal(layout.children[0].layoutChild?.layoutGrow, 0)
})

test("旋转节点带 ROTATED_BOUNDS_APPROX", () => {
  const root = snap({ id: "1:1", rotation: 15 })
  const layout = snapshotToLayout(root, 0)
  assert.deepEqual(layout.warnings, ["ROTATED_BOUNDS_APPROX"])
})

test("超长文本截断", () => {
  const text: TextStyle = {
    characters: "字".repeat(TEXT_CHAR_LIMIT + 10),
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: { unit: "AUTO", value: null },
    letterSpacing: { unit: "PIXELS", value: 0 },
    textAlignHorizontal: "LEFT",
    textAlignVertical: "TOP",
    textAutoResize: "NONE",
  }
  const clamped = clampText(text)
  assert.equal(clamped.characters.length, TEXT_CHAR_LIMIT)
  assert.equal(clamped.truncated, true)
})
