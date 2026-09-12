/**
 * 构建 MCP 服务与 Figma 插件。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import * as esbuild from "esbuild"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["server/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: "dist/server/index.js",
  logLevel: "info",
})

const ui = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["plugin/src/ui.ts"],
  bundle: true,
  write: false,
  target: "es2017",
  logLevel: "info",
})

const js = ui.outputFiles[0]?.text
if (!js) {
  throw new Error("插件 UI 构建没有输出")
}

const html = readFileSync(path.join(root, "plugin/src/ui.html"), "utf8").replace("/*INLINE_UI*/", js)
mkdirSync(path.join(root, "plugin/dist"), { recursive: true })
writeFileSync(path.join(root, "plugin/dist/ui.html"), html)

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["plugin/src/code.ts"],
  bundle: true,
  outfile: "plugin/dist/code.js",
  target: "es2017",
  define: {
    __html__: JSON.stringify(html),
  },
  logLevel: "info",
})

console.error("构建完成：dist/server/index.js 与 plugin/dist/")
