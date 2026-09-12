import assert from "node:assert/strict"
import { test } from "node:test"

import {
  coerceBinBytes,
  isolateChunk,
  sendBinaryChunks,
  yieldToEventLoop,
  type PluginBinFrame,
} from "../plugin/src/bin-transfer.ts"

test("isolateChunk 不共享整图 backing store", () => {
  const parent = Uint8Array.from([1, 2, 3, 4, 5, 6])
  const view = parent.subarray(2, 5)
  const isolated = isolateChunk(view)
  parent[2] = 99
  assert.deepEqual(Array.from(isolated), [3, 4, 5])
  assert.notEqual(isolated.buffer, parent.buffer)
})

test("coerceBinBytes 接受 TypedArray 和 number[]", () => {
  const typed = new Uint8Array(new ArrayBuffer(3))
  typed.set([9, 8, 7])
  assert.deepEqual(Array.from(coerceBinBytes(typed)), [9, 8, 7])
  assert.deepEqual(Array.from(coerceBinBytes([1, 2, 250])), [1, 2, 250])
  assert.deepEqual(Array.from(coerceBinBytes(typed.buffer)), [9, 8, 7])
})

test("coerceBinBytes 拒绝无效类型", () => {
  assert.throws(() => coerceBinBytes("nope"), /Uint8Array 或 number/)
})

test("sendBinaryChunks 发送独立 TypedArray 并在片间让出", async () => {
  const bytes = Uint8Array.from({ length: 5 }, (_, i) => i + 1)
  const frames: PluginBinFrame[] = []
  let yields = 0
  await sendBinaryChunks(
    "req-1",
    "file",
    bytes,
    (message) => {
      frames.push(message)
    },
    async () => {
      yields += 1
    },
    2
  )
  assert.equal(frames.length, 3)
  assert.equal(yields, 4)
  assert.ok(frames.every((frame) => frame.bytes instanceof Uint8Array))
  assert.ok(frames.every((frame) => frame.bytes.buffer !== bytes.buffer))
  assert.deepEqual(
    Array.from(frames.flatMap((frame) => Array.from(frame.bytes))),
    [1, 2, 3, 4, 5]
  )
})

test("yieldToEventLoop 会真正让出", async () => {
  let later = false
  setTimeout(() => {
    later = true
  }, 0)
  await yieldToEventLoop()
  assert.equal(later, true)
})
