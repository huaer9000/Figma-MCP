import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

import { BridgeError } from "../shared/errors.ts"
import { readImageFile, writeImplementBundle } from "../server/src/files.ts"

test("像素级打包只写文件不回传图片字节", async () => {
  const dir = path.join(os.tmpdir(), `figma-bridge-bundle-${Date.now()}`)
  const preview = Uint8Array.from([137, 80, 78, 71])
  const written = await writeImplementBundle({
    outputDir: dir,
    binaries: {
      preview,
      "asset:abc": Uint8Array.from([1, 2, 3]),
    },
    meta: { nodeId: "1:1", warnings: [] },
    node: { id: "1:1", boundsInRoot: { x: 0, y: 0, width: 10, height: 10 } },
  })
  assert.equal(written.outputDir, path.resolve(dir))
  assert.ok(typeof written.files.preview === "string")
  assert.ok(fs.existsSync(String(written.files.preview)))
  assert.ok(fs.existsSync(path.join(dir, "node.json")))
  assert.ok(fs.existsSync(path.join(dir, "meta.json")))
  assert.deepEqual(JSON.stringify(written).includes("iVBORw0K"), false)
})

test("读取本地图片并拒绝不支持的扩展名", async () => {
  const png = path.join(os.tmpdir(), `figma-bridge-img-${Date.now()}.png`)
  fs.writeFileSync(png, Uint8Array.from([137, 80, 78, 71]))
  const read = await readImageFile(png)
  assert.equal(read.ext, ".png")
  assert.equal(read.bytes.byteLength, 4)

  const txt = path.join(os.tmpdir(), `figma-bridge-img-${Date.now()}.txt`)
  fs.writeFileSync(txt, "nope")
  await assert.rejects(
    () => readImageFile(txt),
    (err: unknown) => err instanceof BridgeError && err.code === "INVALID_ARGS"
  )
})
