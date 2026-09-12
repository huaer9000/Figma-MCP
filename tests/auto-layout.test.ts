import assert from "node:assert/strict"
import { test } from "node:test"

import { isLayoutPositioning, isLayoutSizing } from "../shared/auto-layout.ts"

test("只接受 FIXED / HUG / FILL", () => {
  assert.equal(isLayoutSizing("FILL"), true)
  assert.equal(isLayoutSizing("HUG"), true)
  assert.equal(isLayoutSizing("FIXED"), true)
  assert.equal(isLayoutSizing("AUTO"), false)
  assert.equal(isLayoutSizing(""), false)
})

test("只接受 AUTO / ABSOLUTE 定位", () => {
  assert.equal(isLayoutPositioning("AUTO"), true)
  assert.equal(isLayoutPositioning("ABSOLUTE"), true)
  assert.equal(isLayoutPositioning("FILL"), false)
})
