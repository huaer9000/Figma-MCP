/**
 * Auto Layout 写入用的枚举。插件与 MCP 共用，避免各写一份。
 */

/** 宽或高的适应方式。 */
export const LAYOUT_SIZING = ["FIXED", "HUG", "FILL"] as const

/** 子项在 Auto Layout 父级里的定位。 */
export const LAYOUT_POSITIONING = ["AUTO", "ABSOLUTE"] as const

export type LayoutSizing = (typeof LAYOUT_SIZING)[number]
export type LayoutPositioning = (typeof LAYOUT_POSITIONING)[number]

/**
 * 是否为合法的 sizing。
 *
 * @param value 待检查值
 */
export function isLayoutSizing(value: unknown): value is LayoutSizing {
  return typeof value === "string" && (LAYOUT_SIZING as readonly string[]).includes(value)
}

/**
 * 是否为合法的 layoutPositioning。
 *
 * @param value 待检查值
 */
export function isLayoutPositioning(value: unknown): value is LayoutPositioning {
  return typeof value === "string" && (LAYOUT_POSITIONING as readonly string[]).includes(value)
}
