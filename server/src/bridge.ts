/**
 * 本机 WebSocket 桥：单会话、排队、超时、分片重组。
 */

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { WebSocket, WebSocketServer } from "ws"

import { HEARTBEAT_MS, PROTOCOL_VERSION } from "../../shared/constants.js"
import { BridgeError } from "../../shared/errors.js"
import {
  assembleChunks,
  base64ToBytes,
  encodeMessage,
  makeErr,
  makeEvent,
  makeReq,
  parseMessage,
  type HelloPayload,
} from "../../shared/protocol.js"

/** 已完成握手后的会话信息。 */
export interface SessionInfo {
  connected: boolean
  fileName: string | null
  pageName: string | null
  pageId: string | null
  protocol: number | null
}

/** 单次请求的等待器。 */
interface Pending {
  resolve: (value: { result: unknown; binaries: Record<string, Uint8Array> }) => void
  reject: (err: BridgeError) => void
  bins: Map<string, { total: number; parts: Array<Uint8Array | undefined> }>
}

/** 监听选项。 */
export interface ListenOptions {
  /**
   * 含首次在内的绑定次数。默认：系统分配端口为 1，固定端口为 8。
   * 只为覆盖同一客户端重启时的短暂占用，不是允许两个长期进程并存。
   */
  bindAttempts?: number
  /** 重试间隔（毫秒）。默认 250。 */
  bindRetryMs?: number
  /** 心跳间隔（毫秒）。默认 `HEARTBEAT_MS`。测试可缩短。 */
  heartbeatMs?: number
  /**
   * 连续漏 pong 几次后关掉套接字。默认 0：只 ping 保活，不因漏 pong 断开。
   * Figma 插件 iframe 常常不回 WebSocket pong，按漏 pong 关连接会把空闲会话误杀。
   */
  closeAfterMissedPongs?: number
}

/**
 * 插件桥。一个进程只听一个端口。
 */
export class PluginBridge {
  private readonly wss: WebSocketServer
  private readonly extraServers: WebSocketServer[] = []
  private readonly port: number
  private socket: WebSocket | null = null
  private hello: HelloPayload | null = null
  private readonly pending = new Map<string, Pending>()
  private readonly tasks: Array<() => Promise<void>> = []
  private draining = false
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private missedPongs = 0
  private readonly heartbeatMs: number
  private readonly closeAfterMissedPongs: number

  /**
   * @param wss 已开始监听的服务
   * @param port 实际端口
   * @param options 心跳等监听选项
   */
  private constructor(wss: WebSocketServer, port: number, options: ListenOptions = {}) {
    this.wss = wss
    this.port = port
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
    this.closeAfterMissedPongs = options.closeAfterMissedPongs ?? 0
    wss.on("connection", (socket) => this.onConnection(socket))
  }

  /**
   * 在 127.0.0.1 上监听。固定端口被占用时短暂重试，仍失败则抛错。
   *
   * @param port 端口，0 表示由系统分配（测试用）
   * @param options 绑定重试
   */
  static async listen(port: number, options: ListenOptions = {}): Promise<PluginBridge> {
    const attempts = options.bindAttempts ?? (port === 0 ? 1 : 8)
    const retryMs = options.bindRetryMs ?? 250
    let lastError: Error | undefined
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await PluginBridge.listenOnce(port, options)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const busy = lastError.message.includes("已被占用")
        if (!busy || i === attempts - 1) {
          throw lastError
        }
        await new Promise((resolve) => setTimeout(resolve, retryMs))
      }
    }
    throw lastError ?? PluginBridge.portBusyError(port)
  }

  /**
   * 尝试绑定一次。
   *
   * @param port 端口
   * @param options 心跳等监听选项
   */
  private static listenOnce(port: number, options: ListenOptions = {}): Promise<PluginBridge> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: "127.0.0.1", port })
      const fail = (err: Error) => {
        wss.close()
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          reject(PluginBridge.portBusyError(port))
          return
        }
        reject(err)
      }
      wss.once("error", fail)
      wss.once("listening", () => {
        wss.off("error", fail)
        const address = wss.address() as AddressInfo
        const bridge = new PluginBridge(wss, address.port, options)
        wss.on("error", (listenErr) => {
          console.error(`[figma-bridge] ${listenErr.message}`)
        })
        bridge.bindLoopbackV6()
        resolve(bridge)
      })
    })
  }

  /**
   * 端口占用错误。
   *
   * @param port 端口
   */
  private static portBusyError(port: number): Error {
    return new Error(`端口 ${port} 已被占用。请先关掉另一个 Agent 里的 Figma设计桥接 MCP，再重试。`)
  }

  /**
   * 当前监听端口。
   */
  get listenPort(): number {
    return this.port
  }

  /**
   * 给 figma_status 用的会话快照。
   */
  get status(): SessionInfo {
    if (!this.hello || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return {
        connected: false,
        fileName: null,
        pageName: null,
        pageId: null,
        protocol: null,
      }
    }
    return {
      connected: true,
      fileName: this.hello.fileName,
      pageName: this.hello.currentPageName,
      pageId: this.hello.currentPageId,
      protocol: this.hello.protocol,
    }
  }

  /**
   * 排队调用插件方法。
   *
   * @param method 桥方法名
   * @param params 参数
   * @param timeoutMs 从入队起算的超时
   */
  request(
    method: string,
    params: unknown,
    timeoutMs: number
  ): Promise<{ result: unknown; binaries: Record<string, Uint8Array> }> {
    if (!this.isReady()) {
      return Promise.reject(this.notConnected())
    }
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        const waiting = this.pending.get(id)
        this.pending.delete(id)
        waiting?.reject(new BridgeError("TIMEOUT", `调用 ${method} 超时（${timeoutMs}ms）`))
        finish(() => reject(new BridgeError("TIMEOUT", `调用 ${method} 超时（${timeoutMs}ms）`)))
        this.pump()
      }, timeoutMs)

      this.tasks.push(async () => {
        if (settled) {
          return
        }
        if (!this.isReady()) {
          finish(() => reject(this.notConnected()))
          return
        }
        try {
          const value = await this.exchange(id, method, params)
          finish(() => resolve(value))
        } catch (err) {
          finish(() => reject(err instanceof BridgeError ? err : this.notConnected()))
        }
      })
      this.pump()
    })
  }

  /**
   * 关闭服务。测试用。
   */
  async close(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    this.failAll(this.notConnected())
    this.socket?.close()
    await Promise.all([
      new Promise<void>((resolve) => this.wss.close(() => resolve())),
      ...this.extraServers.map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve()))
      ),
    ])
  }

  /**
   * 再听 ::1，避免插件连 ws://localhost 时走到 IPv6 失败。
   */
  private bindLoopbackV6(): void {
    const wss6 = new WebSocketServer({ host: "::1", port: this.port })
    wss6.on("connection", (socket) => this.onConnection(socket))
    wss6.on("error", () => {
      wss6.close()
    })
    wss6.once("listening", () => {
      this.extraServers.push(wss6)
    })
  }

  /**
   * 是否已握手且套接字可用。
   */
  private isReady(): boolean {
    return Boolean(this.hello && this.socket && this.socket.readyState === WebSocket.OPEN)
  }

  /**
   * 统一的未连接错误。
   */
  private notConnected(): BridgeError {
    return new BridgeError(
      "PLUGIN_NOT_CONNECTED",
      "插件未连接。请在 Figma 桌面端打开「Figma设计桥接」插件，并保持面板开着。"
    )
  }

  /**
   * 处理新连接。
   */
  private onConnection(socket: WebSocket): void {
    socket.on("message", (data) => this.onMessage(socket, data.toString()))
    socket.on("close", () => this.onClose(socket))
    socket.on("error", () => this.onClose(socket))
    socket.on("pong", () => {
      if (this.socket === socket) {
        this.missedPongs = 0
      }
    })
  }

  /**
   * 处理一条文本帧。
   */
  private onMessage(socket: WebSocket, raw: string): void {
    let message
    try {
      message = parseMessage(raw)
    } catch (err) {
      if (err instanceof BridgeError && err.code === "PROTOCOL_MISMATCH") {
        socket.send(
          encodeMessage(
            makeEvent("hello_nack", { code: "PROTOCOL_MISMATCH", message: err.message })
          )
        )
        socket.close()
        return
      }
      socket.close()
      return
    }

    if (message.kind === "event" && message.name === "hello") {
      this.acceptHello(socket, message.payload)
      return
    }

    if (this.socket !== socket || !this.hello) {
      return
    }

    if (message.kind === "event" && message.name === "session") {
      const payload = message.payload as HelloPayload
      if (payload && typeof payload.fileName === "string") {
        this.hello = { ...this.hello, ...payload, protocol: PROTOCOL_VERSION }
      }
      return
    }

    if (message.kind === "bin") {
      const pending = this.pending.get(message.id)
      if (!pending) {
        return
      }
      const current = pending.bins.get(message.key) ?? { total: message.total, parts: [] }
      current.total = message.total
      current.parts[message.index] = base64ToBytes(message.data)
      pending.bins.set(message.key, current)
      return
    }

    if (message.kind === "res") {
      const pending = this.pending.get(message.id)
      if (!pending) {
        return
      }
      this.pending.delete(message.id)
      if (!message.ok) {
        pending.reject(new BridgeError(message.error.code, message.error.message, message.error.details))
        return
      }
      try {
        const binaries: Record<string, Uint8Array> = {}
        for (const [key, pack] of pending.bins) {
          const ordered: Uint8Array[] = []
          for (let i = 0; i < pack.total; i += 1) {
            const part = pack.parts[i]
            if (!part) {
              throw new BridgeError("IO_FAILED", `分片不完整：${key}`)
            }
            ordered.push(part)
          }
          binaries[key] = assembleChunks(ordered)
        }
        pending.resolve({ result: message.result, binaries })
      } catch (err) {
        pending.reject(err instanceof BridgeError ? err : new BridgeError("IO_FAILED", String(err)))
      }
    }
  }

  /**
   * 处理 hello。
   */
  private acceptHello(socket: WebSocket, payload: unknown): void {
    const hello = payload as HelloPayload
    if (!hello || hello.protocol !== PROTOCOL_VERSION) {
      socket.send(
        encodeMessage(
          makeEvent("hello_nack", {
            code: "PROTOCOL_MISMATCH",
            message: `插件协议版本不匹配，需要 ${PROTOCOL_VERSION}`,
          })
        )
      )
      socket.close()
      return
    }

    if (this.socket && this.socket !== socket) {
      this.failAll(
        new BridgeError("PLUGIN_NOT_CONNECTED", "插件连接已被新的会话替换")
      )
      this.socket.close()
    }

    this.socket = socket
    this.hello = hello
    this.missedPongs = 0
    this.startHeartbeat(socket)
    socket.send(encodeMessage(makeEvent("hello_ack", { protocol: PROTOCOL_VERSION, port: this.port })))
  }

  /**
   * 套接字关闭。
   */
  private onClose(socket: WebSocket): void {
    if (this.socket !== socket) {
      return
    }
    this.socket = null
    this.hello = null
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    this.failAll(this.notConnected())
  }

  /**
   * 协议层心跳。
   */
  private startHeartbeat(socket: WebSocket): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
    }
    this.missedPongs = 0
    this.heartbeat = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return
      }
      if (this.closeAfterMissedPongs > 0) {
        this.missedPongs += 1
        if (this.missedPongs > this.closeAfterMissedPongs) {
          socket.close()
          return
        }
      }
      try {
        socket.ping()
      } catch {
        socket.close()
      }
    }, this.heartbeatMs)
  }

  /**
   * 发送一次请求并等待响应。
   */
  private exchange(
    id: string,
    method: string,
    params: unknown
  ): Promise<{ result: unknown; binaries: Record<string, Uint8Array> }> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(this.notConnected())
        return
      }
      this.pending.set(id, { resolve, reject, bins: new Map() })
      this.socket.send(encodeMessage(makeReq(id, method, params)))
    })
  }

  /**
   * 串行执行队列。
   */
  private pump(): void {
    if (this.draining) {
      return
    }
    const task = this.tasks.shift()
    if (!task) {
      return
    }
    this.draining = true
    task()
      .catch(() => undefined)
      .finally(() => {
        this.draining = false
        this.pump()
      })
  }

  /**
   * 让所有等待中的请求失败。
   */
  private failAll(err: BridgeError): void {
    for (const pending of this.pending.values()) {
      pending.reject(err)
    }
    this.pending.clear()
  }
}

/**
 * 仅用于测试：构造一条失败响应文本。
 *
 * @param id 请求 id
 */
export function encodePluginError(id: string, code: BridgeError["code"], message: string): string {
  return encodeMessage(makeErr(id, code, message))
}
