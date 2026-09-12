import assert from "node:assert/strict"
import { test } from "node:test"

import { CHUNK_SIZE, MAX_PAYLOAD_BYTES, PROTOCOL_VERSION } from "../shared/constants.ts"
import { BridgeError } from "../shared/errors.ts"
import {
  assembleChunks,
  bytesToBase64,
  chunkBytes,
  encodeMessage,
  makeBinMessages,
  makeErr,
  makeEvent,
  makeOk,
  makeReq,
  parseMessage,
} from "../shared/protocol.ts"

test("parseMessage 拒绝错误协议版本", () => {
  assert.throws(
    () => parseMessage(JSON.stringify({ v: 2, kind: "event", name: "hello", payload: {} })),
    (err: unknown) => err instanceof BridgeError && err.code === "PROTOCOL_MISMATCH"
  )
})

test("parseMessage 往返请求帧", () => {
  const raw = encodeMessage(makeReq("abc", "get_selection", {}))
  const parsed = parseMessage(raw)
  assert.deepEqual(parsed, {
    v: PROTOCOL_VERSION,
    id: "abc",
    kind: "req",
    method: "get_selection",
    params: {},
  })
})

test("成功与失败响应可解析", () => {
  assert.equal(parseMessage(encodeMessage(makeOk("1", { ok: true }))).kind, "res")
  const err = parseMessage(encodeMessage(makeErr("1", "NODE_NOT_FOUND", "找不到节点 12:34")))
  assert.equal(err.kind, "res")
  if (err.kind === "res" && !err.ok) {
    assert.equal(err.error.code, "NODE_NOT_FOUND")
  }
})

test("hello 事件可解析", () => {
  const msg = parseMessage(encodeMessage(makeEvent("hello", { protocol: 1 })))
  assert.equal(msg.kind, "event")
})

test("分片后能还原原始字节", () => {
  const bytes = Uint8Array.from({ length: CHUNK_SIZE + 20 }, (_, i) => i % 256)
  const chunks = chunkBytes(bytes)
  assert.equal(chunks.length, 2)
  assert.deepEqual(assembleChunks(chunks), bytes)
})

test("空字节也保留一片", () => {
  const chunks = chunkBytes(new Uint8Array(0))
  assert.equal(chunks.length, 1)
  assert.equal(assembleChunks(chunks).byteLength, 0)
})

test("超过 20MiB 的组装会失败", () => {
  const huge = new Uint8Array(MAX_PAYLOAD_BYTES + 1)
  assert.throws(
    () => assembleChunks([huge]),
    (err: unknown) => err instanceof BridgeError && err.code === "PAYLOAD_TOO_LARGE"
  )
})

test("bin 帧可用 base64 往返", () => {
  const bytes = Uint8Array.from([1, 2, 3, 250])
  const frames = makeBinMessages("req-1", "preview", bytes)
  assert.equal(frames.length, 1)
  assert.equal(frames[0].data, bytesToBase64(bytes))
  const parsed = parseMessage(encodeMessage(frames[0]))
  assert.equal(parsed.kind, "bin")
})
