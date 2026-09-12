/**
 * 写入用效果合同。插件把它转成 Figma Effect；单测不依赖 figma 全局。
 */

/** 第一版可写的效果类型。 */
export const WRITABLE_EFFECT_TYPES = [
  "BACKGROUND_BLUR",
  "LAYER_BLUR",
  "DROP_SHADOW",
  "INNER_SHADOW",
] as const

/** 可写效果类型。 */
export type WritableEffectType = (typeof WRITABLE_EFFECT_TYPES)[number]

/** Agent 传入的一层效果。 */
export interface EffectInput {
  type: WritableEffectType
  radius: number
  visible?: boolean
  spread?: number
  offset?: { x: number; y: number }
  color?: { r: number; g: number; b: number; a?: number }
}

/** 规范化后的效果，供插件直接赋给 `node.effects`。 */
export interface NormalizedEffect {
  type: WritableEffectType
  radius: number
  visible: boolean
  spread?: number
  offset?: { x: number; y: number }
  color?: { r: number; g: number; b: number; a: number }
}

/**
 * 校验并补齐默认值。模糊不要 color；阴影必须有 color。
 *
 * @param input 原始一层
 */
export function normalizeEffect(input: EffectInput): NormalizedEffect {
  if (!WRITABLE_EFFECT_TYPES.includes(input.type)) {
    throw new Error(`不支持的效果类型：${String(input.type)}`)
  }
  if (!Number.isFinite(input.radius) || input.radius < 0) {
    throw new Error("radius 必须是 >= 0 的数字")
  }
  const visible = input.visible !== false
  if (input.type === "BACKGROUND_BLUR" || input.type === "LAYER_BLUR") {
    return { type: input.type, radius: input.radius, visible }
  }
  if (!input.color) {
    throw new Error(`${input.type} 需要 color`)
  }
  return {
    type: input.type,
    radius: input.radius,
    visible,
    spread: typeof input.spread === "number" ? input.spread : 0,
    offset: {
      x: input.offset?.x ?? 0,
      y: input.offset?.y ?? 0,
    },
    color: {
      r: input.color.r,
      g: input.color.g,
      b: input.color.b,
      a: typeof input.color.a === "number" ? input.color.a : 1,
    },
  }
}

/**
 * 是否为可写效果类型。
 *
 * @param value 未知值
 */
export function isWritableEffectType(value: unknown): value is WritableEffectType {
  return typeof value === "string" && (WRITABLE_EFFECT_TYPES as readonly string[]).includes(value)
}
