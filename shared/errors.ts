/**
 * 桥与 MCP 共用的错误码。
 */

/** 规格第 6.3 节定义的错误码。 */
export type ErrorCode =
  | "PLUGIN_NOT_CONNECTED"
  | "PROTOCOL_MISMATCH"
  | "TIMEOUT"
  | "NODE_NOT_FOUND"
  | "SELECTION_INVALID"
  | "INVALID_ARGS"
  | "UNSUPPORTED_NODE_TYPE"
  | "UNSUPPORTED_EXPORT_FORMAT"
  | "FONT_NOT_AVAILABLE"
  | "EXPORT_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "WRITE_PARTIAL_DENIED"
  | "IO_FAILED"

/**
 * 可序列化的桥错误。
 */
export class BridgeError extends Error {
  /** 稳定错误码。 */
  readonly code: ErrorCode

  /** 可选附加字段，例如 applied / failed。 */
  readonly details?: unknown

  /**
   * @param code 错误码
   * @param message 中文说明
   * @param details 附加信息
   */
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = "BridgeError"
    this.code = code
    this.details = details
  }

  /**
   * 转成协议错误对象。
   */
  toJSON(): { code: ErrorCode; message: string; details?: unknown } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details }
  }
}

/**
 * 把未知抛出值收成 BridgeError。
 *
 * @param err 捕获的值
 */
export function toBridgeError(err: unknown): BridgeError {
  if (err instanceof BridgeError) {
    return err
  }
  if (err instanceof Error) {
    return new BridgeError("INVALID_ARGS", err.message)
  }
  return new BridgeError("INVALID_ARGS", String(err))
}
