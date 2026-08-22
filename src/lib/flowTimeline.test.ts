import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import {
  buildTimeline,
  endpointsOf,
  segmentIndexAtT,
  sharesEndpoint,
  totalDurationSeconds,
} from './flowTimeline'
import { layoutOf } from './layout'
import { indexRoutesById, routeConnections } from './routing'
import type { TimelineSegment } from './flowTimeline'

const SYSTEM_ID = 'sys.gb300-nvl72'
const episode = FACTORY_PACK.flows.find((f) => f.systemId === SYSTEM_ID)!

const layout = layoutOf(SYSTEM_ID)
// rack 深度：这是 GB300 推理 episode 的自然演示深度——整台机器就是一个机架。
const routesAtRack = indexRoutesById(routeConnections(SYSTEM_ID, layout, 'rack'))
const segments = buildTimeline(episode, routesAtRack)

describe('flow 剧本存在且非空（前置条件）', () => {
  it('内容包里至少有一个 GB300 的 FlowEpisode', () => {
    expect(episode).toBeDefined()
    expect(episode.steps.length).toBeGreaterThan(0)
  })
})

describe('buildTimeline：t0/t1 单调归一', () => {
  it('首段 t0 = 0，末段 t1 = 1', () => {
    expect(segments[0]!.t0).toBe(0)
    expect(segments[segments.length - 1]!.t1).toBe(1)
  })

  it('每段 t1 ≥ t0，且与下一段首尾相接（无缝、无重叠）', () => {
    for (const seg of segments) expect(seg.t1).toBeGreaterThanOrEqual(seg.t0)
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.t0).toBeCloseTo(segments[i - 1]!.t1, 9)
    }
  })

  it('全程单调不减：t0 序列本身不减', () => {
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]!.t0).toBeGreaterThanOrEqual(segments[i - 1]!.t0)
    }
  })

  it('区间宽度与 durationHint 成正比', () => {
    const total = totalDurationSeconds(episode)
    for (const seg of segments) {
      expect(seg.t1 - seg.t0).toBeCloseTo(seg.durationHint / total, 6)
    }
  })

  it('确定性：同输入同输出', () => {
    const again = buildTimeline(episode, routesAtRack)
    expect(again).toEqual(segments)
  })
})

describe('logicalOnly 段无路径要求', () => {
  it('本 episode 的 logicalOnly 步骤路径为空数组', () => {
    const logicalSegs = segments.filter((s) => s.logicalOnly)
    expect(logicalSegs.length).toBeGreaterThan(0) // 至少一个 logicalOnly 步骤
    for (const seg of logicalSegs) expect(seg.paths).toEqual([])
  })

  it('查不到路由的 connectionId 被安静过滤掉，不抛错、不产生 undefined 元素', () => {
    const fakeEpisode = {
      ...episode,
      steps: [
        {
          id: 'flow.test.fake',
          phase: 'ingress' as const,
          label: 'x',
          description: 'x',
          connectionIds: ['con.does-not-exist'],
          highlightAssemblyIds: [],
          logicalOnly: false,
          durationHint: 1,
          presalesNote: null,
        },
      ],
    }
    const segs = buildTimeline(fakeEpisode, routesAtRack)
    expect(segs[0]!.paths).toEqual([])
  })
})

describe('非 logicalOnly 相邻步骤路径连通（经共享端点）', () => {
  // 「相邻」按「都带路径的两个 segment，在原始步骤序列里彼此最近」理解——
  // logicalOnly 或本地事件（无 connectionIds）步骤天然没有路径，不参与这条连通性检查。
  const withPaths = segments.filter((s) => s.paths.length > 0)

  it('本 episode 至少有 4 个带物理路径的步骤（ingress/prefill/decode/moe 都有物理段）', () => {
    expect(withPaths.length).toBeGreaterThanOrEqual(4)
  })

  it('任意两个相邻的「带路径」步骤都通过共享装配端点连通', () => {
    for (let i = 1; i < withPaths.length; i += 1) {
      const prev = withPaths[i - 1]!
      const cur = withPaths[i]!
      expect(
        sharesEndpoint(prev, cur),
        `${prev.stepId} → ${cur.stepId} 的路径没有共享端点`,
      ).toBe(true)
    }
  })

  it('ingress 与 egress 复用同一条业务网络连接，端点自然重合', () => {
    const ingress = segments.find((s) => s.stepId === 'flow.gb300.moe-inference.business-ingress')!
    const egress = segments.find((s) => s.stepId === 'flow.gb300.moe-inference.egress')!
    expect(sharesEndpoint(ingress, egress)).toBe(true)
  })
})

describe('至少一个 logicalOnly 步与一个 moe 段', () => {
  it('存在 logicalOnly 步骤', () => {
    expect(segments.some((s) => s.logicalOnly)).toBe(true)
  })

  it('存在 moe-dispatch 与 moe-combine 阶段的步骤', () => {
    expect(segments.some((s) => s.phase === 'moe-dispatch')).toBe(true)
    expect(segments.some((s) => s.phase === 'moe-combine')).toBe(true)
  })
})

describe('segmentIndexAtT', () => {
  it('t=0 落在第一段，t=1 落在最后一段', () => {
    expect(segmentIndexAtT(segments, 0)).toBe(0)
    expect(segmentIndexAtT(segments, 1)).toBe(segments.length - 1)
  })

  it('落在每段区间中点时命中该段自身', () => {
    segments.forEach((seg, i) => {
      const mid = (seg.t0 + seg.t1) / 2
      expect(segmentIndexAtT(segments, mid)).toBe(i)
    })
  })

  it('空 segments 数组返回 -1，不抛错', () => {
    expect(segmentIndexAtT([] as TimelineSegment[], 0.5)).toBe(-1)
  })
})

describe('totalDurationSeconds', () => {
  it('等于全部 durationHint 之和，且 < 60s（教学节奏，不是真实时延）', () => {
    const total = totalDurationSeconds(episode)
    expect(total).toBeCloseTo(
      episode.steps.reduce((s, step) => s + step.durationHint, 0),
      9,
    )
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(60)
  })
})

describe('endpointsOf', () => {
  it('logicalOnly（无路径）段的端点集合为空', () => {
    const seg = segments.find((s) => s.logicalOnly)!
    expect(endpointsOf(seg).size).toBe(0)
  })

  it('带路径段的端点集合非空', () => {
    const seg = segments.find((s) => s.paths.length > 0)!
    expect(endpointsOf(seg).size).toBeGreaterThan(0)
  })
})
