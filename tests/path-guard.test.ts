import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

import { BridgeError } from "../shared/errors.ts"
import { assertReadableFile, assertWritablePath } from "../shared/path-guard.ts"

test("拒绝相对路径", () => {
  assert.throws(
    () => assertWritablePath("tmp/out.png", "file"),
    (err: unknown) => err instanceof BridgeError && err.code === "INVALID_ARGS"
  )
})

test("拒绝根目录和家目录本身", () => {
  assert.throws(() => assertWritablePath("/", "dir"), BridgeError)
  assert.throws(() => assertWritablePath(os.homedir(), "dir"), BridgeError)
})

test("拒绝系统目录", () => {
  assert.throws(() => assertWritablePath("/etc/passwd", "file"), BridgeError)
  assert.throws(() => assertWritablePath("/usr/bin/ls", "file"), BridgeError)
})

test("允许 /tmp 下的文件并创建父目录", () => {
  const target = path.join(os.tmpdir(), "figma-bridge-test", `out-${Date.now()}.png`)
  const resolved = assertWritablePath(target, "file")
  assert.equal(resolved, path.resolve(target))
  assert.ok(fs.existsSync(path.dirname(resolved)))
})

test("可读文件必须存在且不是系统目录", () => {
  assert.throws(() => assertReadableFile("/etc/passwd"), BridgeError)
  assert.throws(() => assertReadableFile(path.join(os.tmpdir(), `missing-${Date.now()}.png`)), BridgeError)
  const target = path.join(os.tmpdir(), `figma-bridge-read-${Date.now()}.png`)
  fs.writeFileSync(target, "png")
  assert.equal(assertReadableFile(target), path.resolve(target))
})
