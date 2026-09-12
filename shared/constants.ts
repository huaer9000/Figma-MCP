/**
 * 第一版协议与运行时常量。
 */

/** 桥协议版本。不兼容变更必须递增。 */
export const PROTOCOL_VERSION = 1

/** 插件自身版本，写入 hello。 */
export const PLUGIN_VERSION = "1.0.1"

/** 默认 WebSocket 端口。 */
export const DEFAULT_PORT = 17653

/** 二进制分片大小（字节）。 */
export const CHUNK_SIZE = 256 * 1024

/** 单次导出解码后体积上限（字节）。 */
export const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024

/** 普通读写超时（毫秒），从入队起算。 */
export const DEFAULT_TIMEOUT_MS = 15_000

/** 导出与像素级读取超时（毫秒）。 */
export const EXPORT_TIMEOUT_MS = 60_000

/** WebSocket 心跳间隔（毫秒）。 */
export const HEARTBEAT_MS = 20_000

/** 文本 characters 截断阈值。 */
export const TEXT_CHAR_LIMIT = 4000

/** 遍历节点数超过该值时写入 LARGE_TREE。 */
export const LARGE_TREE_THRESHOLD = 300

/** read_for_implement / 树读取的最大深度。 */
export const MAX_TREE_DEPTH = 10
