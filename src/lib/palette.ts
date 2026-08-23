/**
 * 颜色单一事实源。
 *
 * ★ 硬规则：本文件（与整个 `src/lib/`）零 three 导入——只产出 `#rrggbb` 字符串，
 *   因此 node 环境可测。
 *
 * 为什么需要它：Canvas 内部 Tailwind class 不生效，3D 材质只能吃具体颜色值。
 * 而 DOM 侧的图例/降级表必须与 3D 连线颜色 1:1 一致，否则「绿色是 NVLink」这个
 * 讲解锚点就断了。于是两侧都以 `src/index.css` 的 CSS 变量为准：
 * DOM 直接用 Tailwind token，3D 侧在这里用 getComputedStyle 读同一个变量。
 *
 * 读取一次性缓存（内容包与主题都是静态的），非浏览器环境（Vitest node）走 fallback 常量表。
 */

import type { NetworkPlane, ProductStatus } from '../data/types'

/** fallback 必须与 `src/index.css` 的 `@theme` 逐条对齐；改主题时两边一起改。 */
export const PALETTE_FALLBACK = {
  ink: '#eef1f5',
  panel: '#ffffff',
  'panel-2': '#f4f6fa',
  line: '#d8dee8',
  fg: '#16202b',
  dim: '#5f6b7a',
  accent: '#0f766e',
  'accent-2': '#6d28d9',
  ok: '#166534',
  warn: '#92400e',
  bad: '#d92d20',
  amber: '#d97706',
  'plane-nvlink': '#76b900',
  'plane-scaleout': '#6d28d9',
  'plane-business': '#1d4ed8',
  'plane-mgmt': '#64748b',
  'plane-power': '#d97706',
  'plane-cooling': '#0891b2',
} as const

export type PaletteToken = keyof typeof PALETTE_FALLBACK
export type Palette = Record<PaletteToken, string>

const TOKENS = Object.keys(PALETTE_FALLBACK) as PaletteToken[]

let cached: Palette | null = null

function readVar(name: PaletteToken): string {
  if (typeof document === 'undefined' || !document.documentElement) return PALETTE_FALLBACK[name]
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
  // 变量缺失或被写成 oklch()/color-mix() 这类 three 解析不了的形式时退回常量。
  return /^#[0-9a-f]{3,8}$/i.test(raw) || /^rgb/i.test(raw) ? raw : PALETTE_FALLBACK[name]
}

/** 读取整套调色板（首次调用后缓存）。 */
export function palette(): Palette {
  if (cached) return cached
  const out = {} as Palette
  for (const t of TOKENS) out[t] = readVar(t)
  cached = out
  return out
}

/** 测试或主题切换后强制重读。 */
export function resetPaletteCache(): void {
  cached = null
}

/**
 * 两个 `#rrggbb` 之间线性插值（t=0 取 a，t=1 取 b）。
 * 用途：把产品状态的色调（announced 蓝 / forecast 琥珀）叠在部件本色上。
 * 解析失败（例如 CSS 变量是 rgb()/oklch() 形式）时原样返回 a，不抛异常。
 */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] | null => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return null
    const n = parseInt(m[1]!, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const ca = parse(a)
  const cb = parse(b)
  if (!ca || !cb) return a
  const k = Math.min(Math.max(t, 0), 1)
  const out = ca.map((v, i) => Math.round(v + (cb[i]! - v) * k))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** 取单个 token 的颜色；未知 token 返回 `fallbackToken` 的颜色。 */
export function color(token: string | null, fallbackToken: PaletteToken = 'dim'): string {
  const p = palette()
  if (token && token in p) return p[token as PaletteToken]
  return p[fallbackToken]
}

/** 六平面 → 颜色。DOM 图例与 3D 连线共用。 */
export const PLANE_TOKEN: Record<NetworkPlane, PaletteToken> = {
  nvlink: 'plane-nvlink',
  scaleout: 'plane-scaleout',
  business: 'plane-business',
  mgmt: 'plane-mgmt',
  power: 'plane-power',
  cooling: 'plane-cooling',
}

export function planeColor(plane: NetworkPlane): string {
  return palette()[PLANE_TOKEN[plane]]
}

/** 六平面中文名。DOM 与降级表复用。 */
export const PLANE_LABEL: Record<NetworkPlane, string> = {
  nvlink: 'NVLink（机架内 scale-up）',
  scaleout: 'Scale-out（East/West 计算网）',
  business: '业务与存储（North/South）',
  mgmt: '管理（带外/带内）',
  power: '供电',
  cooling: '液冷',
}

export const PLANE_ORDER: readonly NetworkPlane[] = [
  'nvlink',
  'scaleout',
  'business',
  'mgmt',
  'power',
  'cooling',
]

/**
 * 产品状态 → 3D 材质语义。
 * shipping = 实体、announced = 蓝调实体、forecast = 琥珀线框（「还没落地」的视觉暗示）。
 * B2 只用到 shipping（内容包目前仅 GB300）；另外两档留给 B4 的代际比较。
 */
export interface StatusMaterial {
  /** 叠加在组件自身颜色上的色调；null = 用组件颜色原样。 */
  tintToken: PaletteToken | null
  /** 0 = 不染色，1 = 完全用 tint 覆盖。 */
  tintAmount: number
  wireframe: boolean
  opacity: number
  roughness: number
  metalness: number
}

export const STATUS_MATERIALS: Record<ProductStatus, StatusMaterial> = {
  shipping: { tintToken: null, tintAmount: 0, wireframe: false, opacity: 1, roughness: 0.55, metalness: 0.15 },
  announced: {
    tintToken: 'plane-business',
    tintAmount: 0.45,
    wireframe: false,
    opacity: 0.92,
    roughness: 0.4,
    metalness: 0.1,
  },
  forecast: {
    tintToken: 'amber',
    tintAmount: 0.8,
    wireframe: true,
    opacity: 0.75,
    roughness: 0.6,
    metalness: 0,
  },
}

/**
 * 3D 专用中性色阶：机箱/托盘/板材/芯片的「工程模型灰」。
 *
 * 它们**没有 DOM 对应物**（DOM 侧不会出现这些颜色），因此不放进 `@theme`，
 * 但仍集中在 palette.ts，保持「所有颜色只有一个出处」这条规矩。
 */
export const SURFACE = {
  rack: '#8e99a8',
  trayShell: '#b7c0cb',
  board: '#3c5a46', // PCB 绿
  metal: '#c3cad4',
  chip: '#333f4d',
  dark: '#2b3540',
  ghost: '#aab4c0',
  ground: '#dfe4ec',
  edge: '#5f6b7a',
} as const

/** 交互态视觉常量（Hotspot 与 Instances 共用，保证两条渲染路径观感一致）。 */
export const HIGHLIGHT = {
  selectedToken: 'accent' as PaletteToken,
  hoveredToken: 'accent-2' as PaletteToken,
  /** 数据流当前步骤「参与的硬件」——与选中同一套 emissive 机制，换个语义色区分。 */
  flowToken: 'accent-2' as PaletteToken,
  selectedEmissive: 0.55,
  hoveredEmissive: 0.28,
  flowEmissive: 0.5,
  ghostOpacity: 0.12,
} as const

/**
 * 数据流播放时的连线强调（v1.1 B3）。
 *
 * ★ 只改 `opacity`/`linewidth`/`color`，**不翻转 `transparent`**——`ConnectionLayer` 的
 *   `<Line>` 材质本来就常开 transparent，因此不需要 `useTransparencyProgramSync`
 *   那套重编着色器的仪式（那是 mesh 在运行期翻 transparent 才需要的）。
 */
export const FLOW_EMPHASIS = {
  /** 当前步骤连接的线宽倍数。 */
  activeWidthScale: 1.8,
  /** 其余（已开平面的）线退让到的不透明度。 */
  idleOpacity: 0.35,
} as const
