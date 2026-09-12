/**
 * 导出路径校验。只允许安全的本机绝对路径。
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { BridgeError } from "./errors.js"

const BLOCKED_PREFIXES = ["/etc", "/usr", "/bin", "/sbin", "/System", "/private", "/dev", "/proc"]

/**
 * 规范化绝对路径，并拒绝系统目录。
 *
 * @param input 用户传入路径
 * @param verb 错误文案里的动作，如「写入」或「读取」
 */
function resolveSafePath(input: string, verb: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new BridgeError("INVALID_ARGS", "路径不能为空")
  }
  if (!path.isAbsolute(input)) {
    throw new BridgeError("INVALID_ARGS", `路径必须是绝对路径：${input}`)
  }

  const resolved = path.resolve(input)
  const home = path.resolve(os.homedir())

  if (resolved === "/" || resolved === home) {
    throw new BridgeError("INVALID_ARGS", `不允许${verb} ${resolved}`)
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(`${prefix}/`)) {
      throw new BridgeError("INVALID_ARGS", `不允许${verb}系统目录：${resolved}`)
    }
  }

  return resolved
}

/**
 * 校验并规范化可写路径。
 *
 * @param input 用户传入路径
 * @param kind file 表示文件路径，dir 表示目录
 */
export function assertWritablePath(input: string, kind: "file" | "dir"): string {
  const resolved = resolveSafePath(input, "写入")
  const parent = kind === "file" ? path.dirname(resolved) : resolved
  fs.mkdirSync(parent, { recursive: true })
  return resolved
}

/**
 * 校验并规范化可读文件路径。文件必须已存在。
 *
 * @param input 用户传入的绝对路径
 */
export function assertReadableFile(input: string): string {
  const resolved = resolveSafePath(input, "读取")
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new BridgeError("IO_FAILED", `找不到可读文件：${resolved}`)
  }
  return resolved
}
