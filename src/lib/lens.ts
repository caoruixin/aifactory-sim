/**
 * 领域切面的派生逻辑（纯函数，零 three 导入，node 可测）。
 *
 * 与 `sceneHighlight.ts` / `flowTimeline.ts` 同一个模式：**门条件与派生值只有一个出处**。
 * 「什么时候算正在看切面」「本章要求的六平面开关是哪一组」「用户是不是已经偏离本章视角」
 * 全部折在这里，UI 组件与 3D 侧只消费结果，不各写一遍判断。
 *
 * 三条与内容层的约定：
 * 1. `LensChapter` **内嵌**场景字段（systemId/lodLevel/focusAssemblyId/planes/highlight*），
 *    不引用 `ScenePreset`——切面与导览是两套叙事，共用数据结构只会互相污染；
 * 2. `ChainLink.hardwareRoleKeys` 是**跨代语义键**，永远在**本章 systemId 内**解析成
 *    装配 ID（`assemblyIdOfRoleKey`），绝不解析 ID 字符串；
 * 3. 章节序号 `chapterIdx` 是**该 lens 内**的次序（与 `tourStopIdx` 的「系统内序号」不同：
 *    切面章节可以跨代，序号只属于 lens 自己）。
 */

import { FACTORY_PACK, assembliesOfSystem, lensById, systemById } from '../data'
import type { ChainLink, LensChapter, LodLevel, NetworkPlane, TechniqueCategory } from '../data/types'
import { PLANE_ORDER } from './palette'

/**
 * 技术类别的中文显示名（与 `metricLabel` / `planeLabel` 同一个纪律：枚举值是数据层的键，
 * 显示名只有一个出处）。全枚举由 `lens.test.ts` 锁住。
 */
export const TECHNIQUE_CATEGORY_LABEL: Record<TechniqueCategory, string> = {
  transport: '传输层',
  collective: '集合通信',
  'kv-management': 'KV 管理',
  'model-loading': '模型加载',
  orchestration: '编排',
  routing: '网络路由',
}

/** store 里的切面状态。`chapterIdx = -1` = 有 lens 但没有激活章节（换代后的空态）。 */
export interface LensViewState {
  lensId: string | null
  chapterIdx: number
}

/** 没有历史时进哪个切面（内容包里的第一条）。 */
export const DEFAULT_LENS_ID: string = FACTORY_PACK.lenses[0]?.id ?? 'lens.network'

/**
 * 宽松解析 lens 标识：深链 `?lens=network` 的短名与全 id `lens.network` 都接受。
 * 未知值返回 null（深链写错不该把界面打崩，同 `?tour=` 的既有纪律）。
 */
export function resolveLensId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const key = raw.trim()
  if (!key) return null
  if (lensById(key)) return key
  const prefixed = `lens.${key}`
  return lensById(prefixed) ? prefixed : null
}

/** 第 idx 章（该 lens 内序号）；lens 未知或序号越界返回 null。 */
export function lensChapterAt(lensId: string | null | undefined, idx: number): LensChapter | null {
  if (!lensId) return null
  const lens = lensById(lensId)
  if (!lens) return null
  if (!Number.isInteger(idx) || idx < 0) return null
  return lens.chapters[idx] ?? null
}

/** 该 lens 的章节总数（0 = 未知 lens）。 */
export function lensChapterCount(lensId: string | null | undefined): number {
  if (!lensId) return 0
  return lensById(lensId)?.chapters.length ?? 0
}

/**
 * 章节 → 六平面开关。章节 `planes` 里列出的开、其余关（与 `store.applyScene` 对场景
 * 的处理完全一致：切面章节同样是「只看这几张网」的减法教学）。
 */
export function chapterPlaneFlags(chapter: LensChapter): Record<NetworkPlane, boolean> {
  return PLANE_ORDER.reduce(
    (acc, p) => {
      acc[p] = chapter.planes.includes(p)
      return acc
    },
    {} as Record<NetworkPlane, boolean>,
  )
}

/**
 * 当前激活的章节——**生效条件的唯一出处**（仿 `activeTourScene`）。
 *
 * 只有 `mode === 'lens'` 且 `chapterIdx` 落在该 lens 的章节表内才算「正在看切面」：
 * 退出切面后残留的 lensId/序号一律不生效，换代后被清成 -1 的章节同理。
 */
export function activeLensChapter(mode: string, lens: LensViewState | null | undefined): LensChapter | null {
  if (mode !== 'lens') return null
  if (!lens) return null
  if (lens.chapterIdx < 0) return null
  return lensChapterAt(lens.lensId, lens.chapterIdx)
}

/** `isChapterStateDirty` 的观测量：用户此刻的下钻层级、焦点链与平面开关。 */
export interface ChapterViewState {
  level: LodLevel
  focusPath: readonly string[]
  planes: Readonly<Record<NetworkPlane, boolean>>
}

/**
 * 用户是否已经偏离本章视角（左栏据此出「↺ 恢复」）。
 *
 * ★ `focusAssemblyId === null` 的章节（如「RAG 与 L4」纯叙事章）**不比焦点**：
 *   那种章节根本不动 3D 焦点，拿当前焦点去比会永远判成「已偏离」。
 * ★ 不比代际：手动换代会把 `chapterIdx` 清成 -1（章节直接失效），
 *   走不到这里；把代际塞进来只会多一条永远为假的分支。
 */
export function isChapterStateDirty(chapter: LensChapter, view: ChapterViewState): boolean {
  if (view.level !== chapter.lodLevel) return true
  if (chapter.focusAssemblyId !== null) {
    const focusId = view.focusPath[view.focusPath.length - 1] ?? null
    if (focusId !== chapter.focusAssemblyId) return true
  }
  const want = chapterPlaneFlags(chapter)
  for (const plane of PLANE_ORDER) {
    if ((view.planes[plane] ?? false) !== want[plane]) return true
  }
  return false
}

/**
 * roleKey → 该系统内的装配 ID（跨代语义键纪律：因果链写角色，界面点具体那一件）。
 * 同一 roleKey 在一个系统里可能有多个节点时取声明顺序里的第一个；查不到返回 null。
 */
export function assemblyIdOfRoleKey(systemId: string, roleKey: string): string | null {
  return assembliesOfSystem(systemId).find((a) => a.roleKey === roleKey)?.id ?? null
}

/** 因果链一行的硬件锚点：保序、去重，解析不到的角色以 `assemblyId: null` 保留（不静默丢）。 */
export interface ChainHardwareRef {
  roleKey: string
  assemblyId: string | null
}

export function chainHardwareRefs(chapter: LensChapter, link: ChainLink): ChainHardwareRef[] {
  const seen = new Set<string>()
  const out: ChainHardwareRef[] = []
  for (const roleKey of link.hardwareRoleKeys) {
    if (seen.has(roleKey)) continue
    seen.add(roleKey)
    out.push({ roleKey, assemblyId: assemblyIdOfRoleKey(chapter.systemId, roleKey) })
  }
  return out
}

/** 章节 id → (lensId, 章节序号)。`crossRefs` 跳转用，跨 lens 也能定位。 */
export function locateChapter(chapterId: string): { lensId: string; chapterIdx: number } | null {
  for (const lens of FACTORY_PACK.lenses) {
    const idx = lens.chapters.findIndex((c) => c.id === chapterId)
    if (idx >= 0) return { lensId: lens.id, chapterIdx: idx }
  }
  return null
}

/**
 * 代际短名：去掉厂商前缀与「（预测）」后缀，塞得进 248px 左栏的一行。
 * 顶栏代际按钮与切面章节副行共用（这是纯展示措辞，与 `planeLabel` 同一类东西）。
 */
export function shortSystemName(name: string): string {
  return name.replace(/^NVIDIA\s+/, '').replace(/（预测）$/, '')
}

/** 同上，直接给 systemId；未知系统回落显示 id 本身。 */
export function shortSystemNameOf(systemId: string): string {
  const system = systemById(systemId)
  return system ? shortSystemName(system.name) : systemId
}
