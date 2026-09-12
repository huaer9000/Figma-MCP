import assert from "node:assert/strict"
import { test } from "node:test"

import { isWritableEffectType, normalizeEffect } from "../shared/effects.ts"

test("背景模糊不需要 color", () => {
  const effect = normalizeEffect({ type: "BACKGROUND_BLUR", radius: 20 })
  assert.deepEqual(effect, { type: "BACKGROUND_BLUR", radius: 20, visible: true })
})

test("阴影缺少 color 会失败", () => {
  assert.throws(() => normalizeEffect({ type: "DROP_SHADOW", radius: 8 }), /需要 color/)
})

test("阴影补齐 offset 和透明度", () => {
  const effect = normalizeEffect({
    type: "DROP_SHADOW",
    radius: 8,
    color: { r: 0, g: 0, b: 0 },
  })
  assert.equal(effect.spread, 0)
  assert.deepEqual(effect.offset, { x: 0, y: 0 })
  assert.equal(effect.color?.a, 1)
})

test("拒绝未知类型和负 radius", () => {
  assert.equal(isWritableEffectType("GLASS"), false)
  assert.throws(
    () => normalizeEffect({ type: "BACKGROUND_BLUR", radius: -1 }),
    /radius/
  )
})
