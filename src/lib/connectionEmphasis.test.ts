/**
 * 连接强调的三档优先级（v1.6 W-B）。
 *
 * 这里钉住的是 `connectionEmphasis.ts` 顶部那段规范注释：
 * flow.playing 赢 → 切面章节赢（含 reducedMotion）→ 维持现状。
 * 优先级改了测试必红，测试改了注释也得跟着改。
 */

import { describe, expect, it } from 'vitest'
import { connectionEmphasis, emphasizedConnectionIds } from './connectionEmphasis'
import { lensChapterAt } from './lens'

const NETWORK = 'lens.network'
const STORAGE = 'lens.storage'
const CH0 = lensChapterAt(NETWORK, 0)! // GB300 rack，两条 nvlink 连接
const STORAGE_CH0 = lensChapterAt(STORAGE, 0)! // GB300 cluster，三条存储路径连接

const STEP = ['con.gb300.gpu-nvswitch', 'con.gb300.nvswitch-backplane'] as const
const STEP_OTHER = ['con.gb300.cx8-leaf'] as const

const BASE = {
  mode: 'explore',
  lens: null,
  stepConnectionIds: [] as readonly string[],
  flowPlaying: false,
  reducedMotion: false,
}

const LENS_ON = { mode: 'lens', lens: { lensId: NETWORK, chapterIdx: 0 } }

describe('① 播放中的数据流赢', () => {
  it('flow.playing + 有连接的步骤 → 数据流集合，其余退让', () => {
    const e = connectionEmphasis({ ...BASE, ...LENS_ON, stepConnectionIds: STEP_OTHER, flowPlaying: true })
    expect(e.source).toBe('flow')
    expect(e.connectionIds).toEqual([...STEP_OTHER])
    expect(e.dim).toBe(true)
  })

  it('★ 逻辑层步骤（connectionIds 为空）不算数：让位给切面章节', () => {
    const e = connectionEmphasis({ ...BASE, ...LENS_ON, stepConnectionIds: [], flowPlaying: true })
    expect(e.source).toBe('lens')
    expect(e.connectionIds).toEqual(CH0.highlightConnectionIds)
  })

  it('没有切面时逻辑层步骤退回「维持现状」的空集合', () => {
    const e = connectionEmphasis({ ...BASE, stepConnectionIds: [], flowPlaying: true })
    expect(e.source).toBe('none')
    expect(e.connectionIds).toEqual([])
    expect(e.dim).toBe(false)
  })
})

describe('② 切面章节赢（含 reducedMotion）', () => {
  it('lens 模式 + 未播放 → 章节的 highlightConnectionIds', () => {
    const e = connectionEmphasis({ ...BASE, ...LENS_ON, stepConnectionIds: STEP })
    expect(e.source).toBe('lens')
    expect(e.connectionIds).toEqual(CH0.highlightConnectionIds)
    expect(e.dim).toBe(true)
  })

  it('★ reducedMotion 下切面强调照旧生效（它本来就是静态的）', () => {
    const e = connectionEmphasis({
      ...BASE,
      ...LENS_ON,
      stepConnectionIds: STEP,
      reducedMotion: true,
    })
    expect(e.source).toBe('lens')
    expect(e.connectionIds).toEqual(CH0.highlightConnectionIds)
  })

  it('存储切面章节点亮的是整条存储路径（三跳）', () => {
    const e = connectionEmphasis({
      ...BASE,
      mode: 'lens',
      lens: { lensId: STORAGE, chapterIdx: 0 },
    })
    expect(e.connectionIds).toEqual(STORAGE_CH0.highlightConnectionIds)
    expect(e.connectionIds.length).toBeGreaterThan(1)
  })

  it('非 lens 模式下残留的 lens 状态不生效（门条件走 activeLensChapter）', () => {
    const e = connectionEmphasis({
      ...BASE,
      mode: 'explore',
      lens: { lensId: NETWORK, chapterIdx: 0 },
      stepConnectionIds: STEP,
    })
    expect(e.source).toBe('none')
    expect(e.connectionIds).toEqual([...STEP])
  })

  it('★ 渲染的是另一代时 lens 分支不生效（比较模式右视口）', () => {
    const e = connectionEmphasis({
      ...BASE,
      ...LENS_ON,
      systemId: 'sys.rubin-ultra-nvl576',
      stepConnectionIds: STEP,
    })
    expect(e.source).toBe('none')
    expect(e.connectionIds).toEqual([...STEP])
  })

  it('systemId 与章节 pin 一致时照常生效', () => {
    const e = connectionEmphasis({ ...BASE, ...LENS_ON, systemId: CH0.systemId })
    expect(e.source).toBe('lens')
  })

  it('★ 章节没有 highlightConnectionIds（纯叙事章）时不抢：退回维持现状', () => {
    const ragIdx = 4
    expect(lensChapterAt(STORAGE, ragIdx)!.id).toBe('lens.storage.rag-l4')
    expect(lensChapterAt(STORAGE, ragIdx)!.highlightConnectionIds).toEqual([])
    const e = connectionEmphasis({
      ...BASE,
      mode: 'lens',
      lens: { lensId: STORAGE, chapterIdx: ragIdx },
      stepConnectionIds: STEP,
    })
    expect(e.source).toBe('none')
    expect(e.connectionIds).toEqual([...STEP])
  })

  it('chapterIdx = -1（换代后的空态）同样不抢', () => {
    const e = connectionEmphasis({
      ...BASE,
      mode: 'lens',
      lens: { lensId: NETWORK, chapterIdx: -1 },
      stepConnectionIds: STEP,
    })
    expect(e.source).toBe('none')
  })
})

describe('③ 维持现状：暂停时仍点亮当前步骤', () => {
  it('未播放、无切面 → 步骤连接照亮，但不压暗其余线', () => {
    const e = connectionEmphasis({ ...BASE, stepConnectionIds: STEP })
    expect(e.source).toBe('none')
    expect(e.connectionIds).toEqual([...STEP])
    expect(e.dim).toBe(false)
  })

  it('reducedMotion 下保留静态退让（没有粒子，这就是主要反馈）', () => {
    const e = connectionEmphasis({ ...BASE, stepConnectionIds: STEP, reducedMotion: true })
    expect(e.dim).toBe(true)
  })

  it('reducedMotion + 逻辑层步骤不压暗（没有一条线被点亮时压暗整屏是 bug）', () => {
    expect(connectionEmphasis({ ...BASE, stepConnectionIds: [], reducedMotion: true }).dim).toBe(false)
  })
})

describe('集合形态与去重', () => {
  it('emphasizedConnectionIds 返回 Set', () => {
    const set = emphasizedConnectionIds({ ...BASE, ...LENS_ON })
    expect(set).toBeInstanceOf(Set)
    expect([...set]).toEqual(CH0.highlightConnectionIds)
  })

  it('重复与空串被清掉，顺序保留', () => {
    const e = connectionEmphasis({
      ...BASE,
      stepConnectionIds: ['a', 'a', '', 'b'],
    })
    expect(e.connectionIds).toEqual(['a', 'b'])
  })
})
